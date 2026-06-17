"""
Analyst price-target consensus + recommendation distribution (yfinance).

US-only — non-US codes return an unavailable payload. Cached 1h since
consensus updates daily at most.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from ._helpers import _opt_float, _yf_symbol, now_iso, yf


_ANALYST_CACHE: dict[str, dict] = {}
_ANALYST_LOCK = threading.Lock()
_ANALYST_TTL_S = 60 * 60  # 1 hour — consensus updates daily at most


def fetch_analyst_for(code: str) -> dict:
    """Analyst price-target consensus + recommendation distribution for a
    US ticker. Both fields can be None when yfinance has no coverage; the
    UI hides the ribbon in that case."""
    sym = _yf_symbol(code)
    if not sym:
        return {"available": False, "code": code, "cachedAt": now_iso()}

    with _ANALYST_LOCK:
        now = datetime.now(timezone.utc).timestamp()
        cached = _ANALYST_CACHE.get(sym)
        if cached and (now - cached["fetched_at"]) < _ANALYST_TTL_S:
            return cached["data"]

    targets: dict | None = None
    recommendations: list[dict] = []
    if yf is not None:
        try:
            t = yf.Ticker(sym)
            raw_targets = t.analyst_price_targets
            if isinstance(raw_targets, dict) and raw_targets:
                targets = {
                    "current": _opt_float(raw_targets.get("current")),
                    "mean": _opt_float(raw_targets.get("mean")),
                    "median": _opt_float(raw_targets.get("median")),
                    "high": _opt_float(raw_targets.get("high")),
                    "low": _opt_float(raw_targets.get("low")),
                }
        except Exception:
            targets = None

        try:
            df = t.recommendations
            if df is not None and not df.empty:
                for _, row in df.iterrows():
                    recommendations.append({
                        "period": str(row.get("period") or ""),
                        "strongBuy": int(row.get("strongBuy") or 0),
                        "buy": int(row.get("buy") or 0),
                        "hold": int(row.get("hold") or 0),
                        "sell": int(row.get("sell") or 0),
                        "strongSell": int(row.get("strongSell") or 0),
                    })
        except Exception:
            recommendations = []

    payload = {
        "available": yf is not None,
        "code": code,
        "symbol": sym,
        "priceTargets": targets,
        "recommendations": recommendations,
        "cachedAt": now_iso(),
    }
    with _ANALYST_LOCK:
        _ANALYST_CACHE[sym] = {"data": payload, "fetched_at": now}
    return payload
