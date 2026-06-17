"""Helpers for AI endpoints that require a strict JSON object.

Some OpenAI-compatible providers occasionally return an empty content string
or wrap JSON in a markdown fence even when JSON mode is requested. These
helpers keep the strategy endpoints tolerant without weakening validation.
"""
from __future__ import annotations

import copy
import json
import re
from typing import Any

from llm import chat_completion


_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.IGNORECASE | re.DOTALL)


def _extract_json_object(raw: str) -> dict:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty response")

    candidates = [text]
    candidates.extend(m.group(1).strip() for m in _FENCE_RE.finditer(text))

    decoder = json.JSONDecoder()
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        start = candidate.find("{")
        if start >= 0:
            try:
                parsed, _ = decoder.raw_decode(candidate[start:])
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass

    raise ValueError("no valid JSON object found")


def request_json_object(chat_payload: dict[str, Any]) -> tuple[dict, dict]:
    attempts: list[dict[str, Any]] = [copy.deepcopy(chat_payload)]

    retry_payload = copy.deepcopy(chat_payload)
    retry_payload.pop("json", None)
    retry_payload["temperature"] = min(float(retry_payload.get("temperature") or 0.2), 0.1)
    retry_payload["messages"] = [
        *retry_payload.get("messages", []),
        {
            "role": "user",
            "content": (
                "Return exactly one valid JSON object. Do not use markdown, "
                "code fences, comments, or any surrounding text."
            ),
        },
    ]
    attempts.append(retry_payload)

    last_raw = ""
    last_error = "unknown parse error"
    for payload in attempts:
        res = chat_completion(payload)
        last_raw = (res.get("content") or "").strip()
        try:
            return _extract_json_object(last_raw), res
        except ValueError as e:
            last_error = str(e)

    excerpt = last_raw[:200] if last_raw else "<empty response>"
    raise RuntimeError(
        f"AI returned invalid JSON: {last_error}. Response excerpt: {excerpt}"
    )
