"""
Sentiment data sources — CNN Fear & Greed + Polymarket top events.

Both sources are cached aggressively (5 min) since they update slowly and
we want to stay below upstream rate limits.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from db import cache_get, cache_set

from ._helpers import _safe_float, now_iso


# ── CNN Fear & Greed ───────────────────────────────────────────────────
_CNN_FG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
_CNN_FG_CACHE_KEY = "sentiment:fear-greed"
_CNN_FG_TTL_S = 300

_CNN_FG_INDICATORS: list[tuple[str, str, str]] = [
    ("market_momentum_sp125", "Market Momentum", "S&P 500 vs its 125-day moving average"),
    ("stock_price_strength", "Stock Price Strength", "NYSE 52-week highs vs lows"),
    ("stock_price_breadth", "Stock Price Breadth", "McClellan Volume Summation Index"),
    ("put_call_options", "Put / Call Options", "5-day average put-to-call ratio"),
    ("market_volatility_vix", "Market Volatility", "VIX vs its 50-day moving average"),
    ("safe_haven_demand", "Safe Haven Demand", "Stocks vs Treasuries · 20d return spread"),
    ("junk_bond_demand", "Junk Bond Demand", "Junk vs investment-grade yield spread"),
]


def _cnn_ts_to_iso(ts) -> str | None:
    if ts in (None, ""):
        return None
    try:
        ms = float(ts)
    except (TypeError, ValueError):
        return None
    try:
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()
    except (ValueError, OSError, OverflowError):
        return None


def _cnn_fg_fetch_raw() -> dict:
    req = urllib.request.Request(
        _CNN_FG_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.cnn.com/",
            "Origin": "https://www.cnn.com",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_fear_greed() -> dict:
    """Returns the F&G payload shaped for the frontend.

    Cached in SQLite for ~5 minutes — CNN updates the index slowly enough
    that polling per-pageview would be wasteful (and risk getting throttled).
    """
    cached = cache_get(_CNN_FG_CACHE_KEY)
    if isinstance(cached, dict):
        return cached

    raw = _cnn_fg_fetch_raw()
    now = datetime.now(timezone.utc).timestamp()

    fg = raw.get("fear_and_greed") or {}
    score = _safe_float(fg.get("score"))
    rating = str(fg.get("rating") or "").lower() or None

    history = {
        "previousClose": _safe_float(fg.get("previous_close")),
        "oneWeek": _safe_float(fg.get("previous_1_week")),
        "oneMonth": _safe_float(fg.get("previous_1_month")),
        "oneYear": _safe_float(fg.get("previous_1_year")),
    }

    hist_data = (raw.get("fear_and_greed_historical") or {}).get("data") or []
    cutoff_ms = (now - 180 * 86400) * 1000
    sparkline: list[dict] = []
    for pt in hist_data:
        x = pt.get("x")
        y = pt.get("y")
        if x is None or y is None:
            continue
        try:
            x_ms = float(x)
        except (TypeError, ValueError):
            continue
        if x_ms < cutoff_ms:
            continue
        iso = _cnn_ts_to_iso(x_ms)
        if not iso:
            continue
        sparkline.append({"date": iso, "value": _safe_float(y)})

    indicators: list[dict] = []
    for key, label, desc in _CNN_FG_INDICATORS:
        block = raw.get(key) or {}
        ind_score = _safe_float(block.get("score"))
        ind_rating = str(block.get("rating") or "").lower() or None
        indicators.append({
            "id": key,
            "label": label,
            "description": desc,
            "score": ind_score,
            "rating": ind_rating,
        })

    payload = {
        "score": score,
        "rating": rating,
        "updatedAt": _cnn_ts_to_iso(fg.get("timestamp")) or now_iso(),
        "history": history,
        "sparkline": sparkline,
        "indicators": indicators,
        "source": "cnn",
        "cachedAt": now_iso(),
    }

    cache_set(_CNN_FG_CACHE_KEY, payload, ttl_s=_CNN_FG_TTL_S)
    return payload


# ── Polymarket — top events by 24h volume ──────────────────────────────
_POLYMARKET_URL = "https://gamma-api.polymarket.com/events"
_POLYMARKET_CACHE_KEY = "sentiment:polymarket-top"
_POLYMARKET_TTL_S = 300


def _poly_outcomes(market: dict) -> list[dict]:
    """Polymarket encodes ``outcomes`` and ``outcomePrices`` as JSON
    strings inside the JSON response (legacy of their Solidity contract
    storage). Decode defensively — bad rows just produce an empty list."""
    raw_outcomes = market.get("outcomes")
    raw_prices = market.get("outcomePrices")
    if isinstance(raw_outcomes, str):
        try:
            raw_outcomes = json.loads(raw_outcomes)
        except json.JSONDecodeError:
            raw_outcomes = []
    if isinstance(raw_prices, str):
        try:
            raw_prices = json.loads(raw_prices)
        except json.JSONDecodeError:
            raw_prices = []
    out: list[dict] = []
    for label, price in zip(raw_outcomes or [], raw_prices or []):
        out.append({"label": str(label), "price": _safe_float(price)})
    return out


def _poly_fetch_raw(limit: int = 10) -> list:
    params = urllib.parse.urlencode({
        "active": "true",
        "closed": "false",
        "archived": "false",
        "order": "volume24hr",
        "ascending": "false",
        "limit": str(limit),
    })
    url = f"{_POLYMARKET_URL}?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Tape Bridge)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not isinstance(data, list):
        return []
    return data


def fetch_polymarket_top(limit: int = 10) -> dict:
    """Top events by 24h volume. Cached 5 minutes in SQLite."""
    cache_key = f"{_POLYMARKET_CACHE_KEY}:{int(limit)}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    raw = _poly_fetch_raw(limit=limit)

    events: list[dict] = []
    for ev in raw:
        markets_raw = ev.get("markets") or []
        markets: list[dict] = []
        for m in markets_raw:
            if m.get("closed"):
                continue
            markets.append({
                "id": str(m.get("id")) if m.get("id") is not None else None,
                "question": m.get("question") or "",
                "groupItemTitle": m.get("groupItemTitle") or None,
                "outcomes": _poly_outcomes(m),
                "volume24hr": _safe_float(m.get("volume24hr")),
                "endDate": m.get("endDate"),
            })
        events.append({
            "id": str(ev.get("id")) if ev.get("id") is not None else "",
            "slug": ev.get("slug") or "",
            "title": ev.get("title") or "",
            "description": ev.get("description") or None,
            "category": ev.get("category") or None,
            "image": ev.get("image") or ev.get("icon") or None,
            "endDate": ev.get("endDate"),
            "volume24hr": _safe_float(ev.get("volume24hr")),
            "liquidity": _safe_float(ev.get("liquidity")),
            "markets": markets,
        })

    payload = {
        "events": events,
        "source": "polymarket",
        "cachedAt": now_iso(),
    }
    cache_set(cache_key, payload, ttl_s=_POLYMARKET_TTL_S)
    return payload
