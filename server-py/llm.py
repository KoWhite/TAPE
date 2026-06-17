"""Provider-neutral LLM gateway for the Tape bridge.

DeepSeek exposes an OpenAI-compatible Chat Completions API, so the bridge
keeps a small adapter shape that can later host additional compatible
providers without changing frontend calls.

Web search: callers can set `enableWebSearch: true` to expose a
`search_web` tool backed by Tavily. The bridge runs the tool-call loop
server-side (model decides → bridge executes → model summarizes) so the
frontend keeps the same chat / chat-stream contract.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Iterator

from sources import search_web, web_search_configured

# .env loading happens once at process start in app.py via dotenv_loader.
# We rely on it here rather than re-reading the file: keeping a single
# loader avoids drift between "what app.py sees" and "what llm.py sees"
# when someone changes the parser later.
AI_DEFAULT_PROVIDER = os.environ.get("AI_PROVIDER", "deepseek").strip() or "deepseek"
AI_TIMEOUT_SECONDS = float(os.environ.get("AI_TIMEOUT_SECONDS", "60"))


@dataclass(frozen=True)
class LlmProvider:
    id: str
    label: str
    base_url: str
    api_key_env: str
    default_model: str
    models: tuple[str, ...]

    def api_key(self) -> str:
        return os.environ.get(self.api_key_env, "").strip()


PROVIDERS: dict[str, LlmProvider] = {
    "deepseek": LlmProvider(
        id="deepseek",
        label="DeepSeek",
        base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/"),
        api_key_env="DEEPSEEK_API_KEY",
        default_model=os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash").strip()
        or "deepseek-v4-flash",
        models=("deepseek-v4-flash", "deepseek-v4-pro"),
    ),
}


def list_ai_providers() -> dict:
    return {
        "defaultProvider": AI_DEFAULT_PROVIDER,
        "webSearchConfigured": web_search_configured(),
        "providers": [
            {
                "id": p.id,
                "label": p.label,
                "baseUrl": p.base_url,
                "defaultModel": p.default_model,
                "models": list(p.models),
                "configured": bool(p.api_key()),
            }
            for p in PROVIDERS.values()
        ],
    }


def _provider(provider_id: str | None) -> LlmProvider:
    key = (provider_id or AI_DEFAULT_PROVIDER).strip() or AI_DEFAULT_PROVIDER
    provider = PROVIDERS.get(key)
    if provider is None:
        raise ValueError(f"unsupported AI provider: {key}")
    return provider


def _optional_number(payload: dict, key: str, low: float, high: float) -> float | int | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be a number")
    if value < low or value > high:
        raise ValueError(f"{key} must be between {low} and {high}")
    return value


def _optional_int(payload: dict, key: str, low: int, high: int) -> int | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, int):
        raise ValueError(f"{key} must be an integer")
    if value < low or value > high:
        raise ValueError(f"{key} must be between {low} and {high}")
    return value


def _error_detail(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        msg = data.get("error", {}).get("message")
        return str(msg or raw)
    except Exception:
        return str(exc)


WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": (
            "Search the live web for current news, prices, filings, or any "
            "fact that may have changed after the model's training cutoff. "
            "Use this proactively whenever the user asks about 'today', "
            "'latest', 'recent', earnings dates, breaking news, or anything "
            "time-sensitive. Returns a short answer plus 3-5 cited sources."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language search query in English or Chinese.",
                },
                "topic": {
                    "type": "string",
                    "enum": ["general", "news"],
                    "description": "Use 'news' for breaking events/recent headlines, 'general' otherwise.",
                },
                "days": {
                    "type": "integer",
                    "description": "When topic='news', restrict to the last N days (1-30).",
                    "minimum": 1,
                    "maximum": 30,
                },
                "max_results": {
                    "type": "integer",
                    "description": "How many sources to return (1-10). Default 5.",
                    "minimum": 1,
                    "maximum": 10,
                },
            },
            "required": ["query"],
        },
    },
}


def _messages(raw: Any) -> list[dict]:
    if not isinstance(raw, list) or not raw:
        raise ValueError("messages (non-empty array) required")

    out: list[dict] = []
    allowed_roles = {"system", "user", "assistant", "tool"}
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("each message must be an object")
        role = item.get("role")
        content = item.get("content")
        if role not in allowed_roles:
            raise ValueError(f"unsupported message role: {role!r}")
        # tool / assistant messages can have null content when carrying tool_calls
        if content is not None and not isinstance(content, str):
            raise ValueError("message content must be a string")
        msg: dict[str, Any] = {"role": role, "content": content}
        if isinstance(item.get("name"), str):
            msg["name"] = item["name"]
        if role == "tool" and isinstance(item.get("tool_call_id"), str):
            msg["tool_call_id"] = item["tool_call_id"]
        if isinstance(item.get("tool_calls"), list):
            msg["tool_calls"] = item["tool_calls"]
        # DeepSeek's reasoning models (thinking mode) require the previous
        # turn's reasoning_content to be passed back on the next request.
        if isinstance(item.get("reasoning_content"), str):
            msg["reasoning_content"] = item["reasoning_content"]
        out.append(msg)
    return out


def _replay_assistant_turn(message: dict, tool_calls: list) -> dict:
    """Build the assistant message we need to re-send on the next round.

    DeepSeek's thinking-mode models reject follow-up requests that drop
    `reasoning_content` from the previous assistant turn — they need the
    full chain-of-thought context to continue. So we echo every field
    the model emitted, not just role/content/tool_calls.
    """
    msg: dict[str, Any] = {
        "role": "assistant",
        "content": message.get("content") or "",
        "tool_calls": tool_calls,
    }
    reasoning = message.get("reasoning_content")
    if isinstance(reasoning, str) and reasoning:
        msg["reasoning_content"] = reasoning
    return msg


def _chat_body(payload: dict, provider: LlmProvider) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": payload.get("model") or provider.default_model,
        "messages": _messages(payload.get("messages")),
    }

    max_tokens = _optional_int(payload, "maxTokens", 1, 384000)
    if max_tokens is None:
        max_tokens = _optional_int(payload, "max_tokens", 1, 384000)
    if max_tokens is not None:
        body["max_tokens"] = max_tokens

    temperature = _optional_number(payload, "temperature", 0, 2)
    if temperature is not None:
        body["temperature"] = temperature

    top_p = _optional_number(payload, "topP", 0, 1)
    if top_p is None:
        top_p = _optional_number(payload, "top_p", 0, 1)
    if top_p is not None:
        body["top_p"] = top_p

    if payload.get("json") is True:
        body["response_format"] = {"type": "json_object"}
    elif isinstance(payload.get("responseFormat"), dict):
        body["response_format"] = payload["responseFormat"]

    if isinstance(payload.get("thinking"), dict):
        body["thinking"] = payload["thinking"]

    tools: list[dict] = []
    if isinstance(payload.get("tools"), list):
        tools.extend(payload["tools"])
    if payload.get("enableWebSearch") is True and web_search_configured():
        tools.append(WEB_SEARCH_TOOL)
    if tools:
        body["tools"] = tools
    if payload.get("toolChoice") is not None:
        body["tool_choice"] = payload["toolChoice"]
    return body


MAX_TOOL_ITERATIONS = 3


def _execute_tool_call(call: dict) -> str:
    """Run a single tool call server-side and return its JSON-string result.

    Errors are returned (not raised) as `{"error": "..."}` so the model
    sees them as a tool result and can recover gracefully — typically by
    summarizing from its existing context.
    """
    fn = (call.get("function") or {})
    name = fn.get("name")
    raw_args = fn.get("arguments") or "{}"
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"invalid arguments JSON: {e}"}, ensure_ascii=False)

    if name == "search_web":
        try:
            result = search_web(
                query=str(args.get("query") or "").strip(),
                topic=str(args.get("topic") or "general"),
                max_results=int(args.get("max_results") or 5),
                days=int(args["days"]) if args.get("days") is not None else None,
                include_answer=True,
            )
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:  # noqa: BLE001 — report any failure back to the model
            return json.dumps({"error": str(e)}, ensure_ascii=False)

    return json.dumps({"error": f"unknown tool: {name}"}, ensure_ascii=False)


def _post_chat(body: dict, provider: LlmProvider, api_key: str) -> dict:
    req = urllib.request.Request(
        f"{provider.base_url}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=AI_TIMEOUT_SECONDS) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{provider.label} HTTP {e.code}: {_error_detail(e)}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"{provider.label} request failed: {e.reason}") from e


def _resolve_tool_calls(body: dict, provider: LlmProvider, api_key: str) -> dict:
    """Drive the tool-call loop and return the final completion payload.

    The model may decide to call `search_web` zero or more times. Each
    round: (1) post the current messages, (2) if the choice carries
    `tool_calls`, append the assistant message plus a `tool` message per
    call and loop, (3) otherwise return. Caps at MAX_TOOL_ITERATIONS to
    keep cost bounded if the model misbehaves.
    """
    data: dict = {}
    for _ in range(MAX_TOOL_ITERATIONS):
        data = _post_chat(body, provider, api_key)
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        tool_calls = message.get("tool_calls") or []
        if not tool_calls:
            break

        body["messages"].append(_replay_assistant_turn(message, tool_calls))
        for call in tool_calls:
            body["messages"].append({
                "role": "tool",
                "tool_call_id": call.get("id") or "",
                "content": _execute_tool_call(call),
            })
    return data


def chat_completion(payload: dict) -> dict:
    provider = _provider(payload.get("provider"))
    api_key = provider.api_key()
    if not api_key:
        raise RuntimeError(f"missing {provider.api_key_env}")

    if payload.get("stream") is True:
        raise ValueError("streaming is not supported by this bridge endpoint yet")

    body = _chat_body(payload, provider)
    data = _resolve_tool_calls(body, provider, api_key)

    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    return {
        "provider": provider.id,
        "model": data.get("model") or body["model"],
        "id": data.get("id"),
        "created": data.get("created"),
        "content": message.get("content") or "",
        "message": message,
        "finishReason": choice.get("finish_reason"),
        "usage": data.get("usage"),
        "raw": data if payload.get("includeRaw") is True else None,
    }


def _stream_raw(body: dict, provider: LlmProvider, api_key: str) -> Iterator[dict]:
    body["stream"] = True
    req = urllib.request.Request(
        f"{provider.base_url}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=AI_TIMEOUT_SECONDS) as res:
            while True:
                raw = res.readline()
                if not raw:
                    break
                line = raw.decode("utf-8", errors="replace").strip()
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data:"):
                    continue
                data_s = line[5:].strip()
                if data_s == "[DONE]":
                    yield {"type": "done"}
                    return
                try:
                    data = json.loads(data_s)
                except json.JSONDecodeError:
                    continue
                choice = (data.get("choices") or [{}])[0]
                delta = choice.get("delta") or {}
                # DeepSeek thinking-mode emits `reasoning_content` deltas
                # before the actual answer — forward them as their own
                # event type so the UI can render the chain of thought
                # without confusing it with the final brief.
                reasoning = delta.get("reasoning_content")
                if reasoning:
                    yield {"type": "reasoning", "content": reasoning}
                content = delta.get("content")
                if content:
                    yield {"type": "delta", "content": content}
                finish_reason = choice.get("finish_reason")
                if finish_reason:
                    yield {"type": "finish", "finishReason": finish_reason}
            yield {"type": "done"}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{provider.label} HTTP {e.code}: {_error_detail(e)}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"{provider.label} request failed: {e.reason}") from e


def chat_completion_stream(payload: dict) -> Iterator[dict]:
    provider = _provider(payload.get("provider"))
    api_key = provider.api_key()
    if not api_key:
        raise RuntimeError(f"missing {provider.api_key_env}")

    body = _chat_body(payload, provider)

    # Streaming + tools doesn't compose well: the model may interleave
    # tool_calls with content, and OpenAI-compatible SSE doesn't surface
    # tool_calls cleanly in deltas. So when tools are present we resolve
    # them non-streaming first (each tool call typically adds 1-2s of
    # latency for the Tavily call), then stream only the final answer.
    if body.get("tools"):
        emitted = False
        for _ in range(MAX_TOOL_ITERATIONS):
            data = _post_chat(body, provider, api_key)
            choice = (data.get("choices") or [{}])[0]
            message = choice.get("message") or {}
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                # Model returned its final answer non-streaming — emit it
                # as a single delta so the frontend's typewriter still
                # renders something. Reasoning (if any) goes through the
                # same event type as the streaming path uses.
                reasoning = message.get("reasoning_content")
                if isinstance(reasoning, str) and reasoning:
                    yield {"type": "reasoning", "content": reasoning}
                content = message.get("content") or ""
                if content:
                    yield {"type": "delta", "content": content}
                yield {"type": "finish", "finishReason": choice.get("finish_reason") or "stop"}
                yield {"type": "done"}
                emitted = True
                break

            body["messages"].append(_replay_assistant_turn(message, tool_calls))
            for call in tool_calls:
                body["messages"].append({
                    "role": "tool",
                    "tool_call_id": call.get("id") or "",
                    "content": _execute_tool_call(call),
                })
        if emitted:
            return
        # Hit iteration cap — drop tools and stream the next answer so the
        # model has to commit to text.
        body.pop("tools", None)
        body.pop("tool_choice", None)
        yield from _stream_raw(body, provider, api_key)
        return

    yield from _stream_raw(body, provider, api_key)
