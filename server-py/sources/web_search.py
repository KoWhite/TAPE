"""
Web search via Tavily — gives LLM tool calls access to fresh information.

Tavily exposes a search-for-AI REST API at https://api.tavily.com/search.
We keep the dependency footprint to urllib (same shape as llm.py) and
return a compact JSON structure the model can summarize without
re-flattening nested fields.

Set `TAVILY_API_KEY` in server-py/.env. Without it `search_web` raises
RuntimeError, which the LLM tool-call loop catches and reports back to
the model as a tool error so it can fall back to its existing context.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request

from ._helpers import now_iso


TAVILY_ENDPOINT = "https://api.tavily.com/search"
TAVILY_TIMEOUT_S = float(os.environ.get("TAVILY_TIMEOUT_SECONDS", "20"))

# 5-minute cache, keyed on (query, topic, max_results, days). Daily-brief
# regenerations within the same window reuse results — Tavily charges per
# request and the freshness gain past 5 minutes is negligible.
_CACHE: dict[str, dict] = {}
_LOCK = threading.Lock()
_TTL_S = 300


def _api_key() -> str:
    return os.environ.get("TAVILY_API_KEY", "").strip()


def search_web(
    query: str,
    *,
    topic: str = "general",
    max_results: int = 5,
    days: int | None = None,
    include_answer: bool = True,
) -> dict:
    """Search the web via Tavily.

    Args:
        query: natural-language search query.
        topic: "general" or "news". "news" biases toward news outlets and
            enables the `days` window.
        max_results: 1..10. Tavily's cap is 20 but 5 is enough for the
            daily-brief use case and keeps prompt tokens down.
        days: when topic="news", restrict to the last N days (1..30).
        include_answer: ask Tavily to synthesize a 1-paragraph answer.

    Returns a dict with `query`, `answer`, `results` (list of
    {title, url, content, published_date, score}), and `fetchedAt`.

    Raises RuntimeError when the API key is missing or the call fails.
    """
    if not query or not query.strip():
        raise ValueError("query is required")
    api_key = _api_key()
    if not api_key:
        raise RuntimeError("missing TAVILY_API_KEY")

    safe_topic = topic if topic in ("general", "news") else "general"
    safe_max = max(1, min(int(max_results or 5), 10))
    safe_days = None
    if safe_topic == "news" and days is not None:
        safe_days = max(1, min(int(days), 30))

    cache_key = f"{query}|{safe_topic}|{safe_max}|{safe_days}|{int(bool(include_answer))}"
    with _LOCK:
        now = time.time()
        cached = _CACHE.get(cache_key)
        if cached and (now - cached["fetched_at"]) < _TTL_S:
            return cached["data"]

    body: dict = {
        "query": query.strip(),
        "topic": safe_topic,
        "max_results": safe_max,
        "include_answer": bool(include_answer),
        "search_depth": "basic",
    }
    if safe_days is not None:
        body["days"] = safe_days

    req = urllib.request.Request(
        TAVILY_ENDPOINT,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=TAVILY_TIMEOUT_S) as res:
            raw = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", errors="replace")
        except Exception:
            detail = str(e)
        raise RuntimeError(f"Tavily HTTP {e.code}: {detail[:300]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Tavily request failed: {e.reason}") from e

    results: list[dict] = []
    for item in raw.get("results") or []:
        if not isinstance(item, dict):
            continue
        results.append({
            "title": str(item.get("title") or ""),
            "url": str(item.get("url") or ""),
            "content": str(item.get("content") or "")[:600],
            "published_date": str(item.get("published_date") or ""),
            "score": item.get("score"),
        })

    payload = {
        "query": query.strip(),
        "answer": str(raw.get("answer") or ""),
        "results": results,
        "fetchedAt": now_iso(),
    }
    with _LOCK:
        _CACHE[cache_key] = {"data": payload, "fetched_at": time.time()}
    return payload


def web_search_configured() -> bool:
    return bool(_api_key())
