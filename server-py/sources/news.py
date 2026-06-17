"""
News (yfinance — proxies Yahoo Finance news).

Per-symbol + market-wide endpoints. yfinance returns a nested `content`
key with title/summary/pubDate/provider/clickThroughUrl; we flatten it
and cache 5 min — Yahoo refreshes major-ticker news ~10 min cadence so
this stays well under any rate-limit risk.

Market news unions news from SPY/QQQ/DIA and dedupes by URL, since
Yahoo has no clean front-page feed.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from ._helpers import _yf_symbol, now_iso, yf


_NEWS_CACHE: dict[str, dict] = {}
_NEWS_LOCK = threading.Lock()
_NEWS_TTL_S = 300


def _flatten_news_item(item: dict) -> dict | None:
    """Pluck the fields we care about out of Yahoo's nested news payload.
    Returns None when the item is missing the bits required to render."""
    content = item.get("content") or {}
    title = content.get("title") or item.get("title")
    if not title:
        return None
    url_block = content.get("clickThroughUrl") or content.get("canonicalUrl") or {}
    url = url_block.get("url") if isinstance(url_block, dict) else None
    if not url:
        return None
    provider_block = content.get("provider") or {}
    thumb_block = content.get("thumbnail") or {}
    thumb_url = None
    if isinstance(thumb_block, dict):
        thumb_url = thumb_block.get("originalUrl")
        if not thumb_url:
            res = thumb_block.get("resolutions") or []
            if isinstance(res, list) and res:
                thumb_url = res[0].get("url")
    return {
        "id": str(item.get("id") or content.get("id") or url),
        "title": str(title),
        "summary": str(content.get("summary") or content.get("description") or "")[:400],
        "url": str(url),
        "provider": str(provider_block.get("displayName") or "Yahoo Finance"),
        "publishedAt": str(content.get("pubDate") or ""),
        "thumbnail": str(thumb_url) if thumb_url else None,
        "type": str(content.get("contentType") or "STORY"),
    }


def _fetch_news_raw(symbol: str, limit: int) -> list[dict]:
    if yf is None:
        return []
    try:
        items = yf.Ticker(symbol).news or []
    except Exception:
        return []
    out: list[dict] = []
    for it in items[: max(1, limit)]:
        flat = _flatten_news_item(it)
        if flat:
            out.append(flat)
    return out


def fetch_news_for(code: str, limit: int = 20) -> dict:
    """Latest news for a single ticker. `code` is broker-style ('US.AAPL'
    or 'AAPL.US'); we only resolve US symbols today since yfinance HK / CN
    news coverage is sparse to nonexistent."""
    sym = _yf_symbol(code)
    if not sym:
        return {"available": False, "code": code, "items": [], "cachedAt": now_iso()}

    cache_key = f"sym:{sym}:{limit}"
    with _NEWS_LOCK:
        now = datetime.now(timezone.utc).timestamp()
        cached = _NEWS_CACHE.get(cache_key)
        if cached and (now - cached["fetched_at"]) < _NEWS_TTL_S:
            return cached["data"]

    items = _fetch_news_raw(sym, limit)
    payload = {
        "available": True,
        "code": code,
        "symbol": sym,
        "items": items,
        "cachedAt": now_iso(),
    }
    with _NEWS_LOCK:
        _NEWS_CACHE[cache_key] = {"data": payload, "fetched_at": now}
    return payload


# Headline-tier ETFs we proxy "market news" through. Yahoo doesn't expose a
# clean front-page news feed, but SPY/QQQ/DIA share the same wire-service
# stories, so unioning them gives a representative market snapshot.
_MARKET_NEWS_PROXIES = ("SPY", "QQQ", "DIA")


def fetch_market_news(limit: int = 20) -> dict:
    """Aggregated market-wide news. Pulls the top stories from each proxy
    ETF and dedupes by URL — first occurrence wins so the most-relevant
    instance keeps its position."""
    cache_key = f"market:{limit}"
    with _NEWS_LOCK:
        now = datetime.now(timezone.utc).timestamp()
        cached = _NEWS_CACHE.get(cache_key)
        if cached and (now - cached["fetched_at"]) < _NEWS_TTL_S:
            return cached["data"]

    seen: set[str] = set()
    merged: list[dict] = []
    if yf is not None:
        for sym in _MARKET_NEWS_PROXIES:
            for item in _fetch_news_raw(sym, limit):
                key = item["url"]
                if key in seen:
                    continue
                seen.add(key)
                merged.append(item)
    # Sort by publishedAt desc — ISO 8601 sorts lexicographically.
    merged.sort(key=lambda x: x.get("publishedAt") or "", reverse=True)
    payload = {
        "available": yf is not None,
        "items": merged[:limit],
        "cachedAt": now_iso(),
    }
    with _NEWS_LOCK:
        _NEWS_CACHE[cache_key] = {"data": payload, "fetched_at": now}
    return payload
