"""
Futu OpenD client + payload transforms.

This module owns the single OpenD `OpenQuoteContext` and converts Futu's
DataFrame rows into the JSON shapes the frontend expects. `app.py` does
HTTP routing; everything broker-specific lives here.

Public surface:
  health_payload()                                -> dict
  fetch_quotes(codes)                             -> list[dict]
  fetch_kline(code, ktype, count, autype)         -> dict
  fetch_bars_smart(code, ktype, count)            -> list[dict]   (Futu → yfinance fallback)
  search_symbols(query)                           -> list[dict]
  close_ctx()                                                     (graceful shutdown)
  OPEND_HOST, OPEND_PORT                                          (for diagnostics / startup banner)
"""
from __future__ import annotations

import os
import sys
import threading
from datetime import datetime

from futu import AuType, KLType, OpenQuoteContext, RET_OK

from db import cache_get, cache_set
from sources import _safe_float, fetch_bars_yf, now_iso


# Bars rarely change minute-to-minute on daily+ resolution but the bridge
# gets hammered by indicator/backtest runs that re-request the same
# (code, ktype, count). Cache them in SQLite so a bridge restart doesn't
# burn yfinance's 429 budget on rebuilding the warm set.
_INTRADAY_KTYPES_BARS = {"K_1M", "K_3M", "K_5M", "K_15M", "K_30M", "K_60M"}


def _bars_cache_ttl(ktype: str) -> int:
    # Mirror yf_bars.py's in-memory TTLs: short for intraday so the latest
    # bar still updates during RTH, long for daily-and-above.
    return 60 if ktype in _INTRADAY_KTYPES_BARS else 10 * 60


OPEND_HOST = os.environ.get("OPEND_HOST", "127.0.0.1")
OPEND_PORT = int(os.environ.get("OPEND_PORT", "11111"))


_ctx: OpenQuoteContext | None = None
_ctx_lock = threading.Lock()
_last_error: str | None = None


def get_ctx() -> OpenQuoteContext:
    global _ctx, _last_error
    with _ctx_lock:
        if _ctx is None:
            _ctx = OpenQuoteContext(host=OPEND_HOST, port=OPEND_PORT)
            _last_error = None
        return _ctx


def close_ctx() -> None:
    """Idempotent close — called from app.main()'s shutdown branch."""
    global _ctx
    with _ctx_lock:
        if _ctx is not None:
            try:
                _ctx.close()
            except Exception:
                pass
            _ctx = None


def market_of(code: str) -> str:
    return code.split(".", 1)[0] if "." in code else "US"


def to_iso(ts) -> str:
    if not ts:
        return now_iso()
    s = str(ts)
    try:
        return datetime.fromisoformat(s.replace(" ", "T")).isoformat()
    except ValueError:
        return now_iso()


def _session_block(row, prefix: str) -> dict | None:
    """Pull a {pre,after,overnight}_* group from a snapshot row.

    Returns None when the price field is empty/zero — Futu populates
    these only for US securities and only outside RTH.
    """
    price_f = _safe_float(row.get(f"{prefix}_price"))
    if price_f <= 0:
        return None

    def num(field: str) -> float:
        return _safe_float(row.get(field))

    return {
        "price": price_f,
        "high": num(f"{prefix}_high_price"),
        "low": num(f"{prefix}_low_price"),
        "change": num(f"{prefix}_change_val"),
        # Futu returns change_rate as a percent (e.g. -0.265 = -0.265%).
        # Frontend expects decimal (0.01 = 1%), so divide by 100.
        "changePct": num(f"{prefix}_change_rate") / 100.0,
        "volume": num(f"{prefix}_volume"),
        "turnover": num(f"{prefix}_turnover"),
    }


def quote_from_row(row) -> dict:
    code = str(row["code"])
    last = _safe_float(row.get("last_price"))
    prev = _safe_float(row.get("prev_close_price"))
    change = last - prev
    sym = code.split(".", 1)[1] if "." in code else code
    mkt = market_of(code)

    sessions = {}
    if mkt == "US":
        for prefix, key in (("pre", "preMarket"), ("after", "afterHours"), ("overnight", "overnight")):
            block = _session_block(row, prefix)
            if block is not None:
                sessions[key] = block

    def numf(field: str) -> float:
        return _safe_float(row.get(field))

    return {
        "code": code,
        "symbol": sym,
        "name": str(row.get("name") or sym),
        "market": mkt,
        "type": "STOCK",
        "last": last,
        "prevClose": prev,
        "change": change,
        "changePct": (change / prev) if prev else 0.0,
        "open": numf("open_price"),
        "high": numf("high_price"),
        "low": numf("low_price"),
        "volume": numf("volume"),
        "turnover": numf("turnover"),
        "high52w": numf("highest52weeks_price"),
        "low52w": numf("lowest52weeks_price"),
        "allTimeHigh": numf("highest_history_price"),
        "allTimeLow": numf("lowest_history_price"),
        "peTtm": numf("pe_ttm_ratio"),
        "marketCap": numf("total_market_val"),
        "updatedAt": to_iso(row.get("update_time")),
        "currency": "USD" if mkt == "US" else ("HKD" if mkt == "HK" else "CNY"),
        "sessions": sessions or None,
    }


def health_payload() -> dict:
    global _last_error
    try:
        ctx = get_ctx()
        ret, data = ctx.get_global_state()
        connected = ret == RET_OK
        if not connected:
            _last_error = str(data)
    except Exception as e:
        connected = False
        _last_error = repr(e)
    return {
        "connected": connected,
        "source": "futu-bridge-py",
        "opend": f"{OPEND_HOST}:{OPEND_PORT}",
        "lastError": _last_error,
    }


def fetch_quotes(codes: list[str]) -> list[dict]:
    ctx = get_ctx()
    ret, data = ctx.get_market_snapshot(codes)
    if ret != RET_OK:
        raise RuntimeError(f"get_market_snapshot failed: {data}")
    return [quote_from_row(row) for _, row in data.iterrows()]


_KTYPE_MAP = {
    "K_1M": KLType.K_1M,
    "K_3M": KLType.K_3M,
    "K_5M": KLType.K_5M,
    "K_15M": KLType.K_15M,
    "K_30M": KLType.K_30M,
    "K_60M": KLType.K_60M,
    "K_DAY": KLType.K_DAY,
    "K_WEEK": KLType.K_WEEK,
    "K_MON": KLType.K_MON,
    "K_QUARTER": KLType.K_QUARTER,
    "K_YEAR": KLType.K_YEAR,
}

_AUTYPE_MAP = {
    "qfq": AuType.QFQ,
    "hfq": AuType.HFQ,
    "none": AuType.NONE,
}

# Lightweight-charts wants ISO date for daily-and-above bars and unix
# seconds for intraday — Futu returns "YYYY-MM-DD HH:MM:SS" either way.
_INTRADAY = {"K_1M", "K_3M", "K_5M", "K_15M", "K_30M", "K_60M"}


def fetch_kline(code: str, ktype: str, count: int, autype: str) -> dict:
    if ktype not in _KTYPE_MAP:
        raise RuntimeError(f"unsupported ktype: {ktype}")
    if autype not in _AUTYPE_MAP:
        raise RuntimeError(f"unsupported autype: {autype}")
    count = max(1, min(int(count), 1000))

    ctx = get_ctx()
    ret, data, _ = ctx.request_history_kline(
        code,
        ktype=_KTYPE_MAP[ktype],
        autype=_AUTYPE_MAP[autype],
        max_count=count,
    )
    if ret != RET_OK:
        raise RuntimeError(f"request_history_kline failed: {data}")

    intraday = ktype in _INTRADAY
    bars: list[dict] = []
    for _, row in data.iterrows():
        tk = str(row.get("time_key") or "")
        if intraday:
            try:
                ts = int(datetime.fromisoformat(tk.replace(" ", "T")).timestamp())
            except ValueError:
                continue
            time_field: int | str = ts
        else:
            time_field = tk.split(" ", 1)[0]
        bars.append({
            "time": time_field,
            "open": _safe_float(row.get("open")),
            "high": _safe_float(row.get("high")),
            "low": _safe_float(row.get("low")),
            "close": _safe_float(row.get("close")),
            "volume": _safe_float(row.get("volume")),
            "turnover": _safe_float(row.get("turnover")),
            "changeRate": _safe_float(row.get("change_rate")) / 100.0,
        })

    return {
        "code": code,
        "ktype": ktype,
        "autype": autype,
        "bars": bars,
    }


def fetch_bars_smart(
    code: str,
    ktype: str = "K_DAY",
    count: int = 250,
    autype: str = "qfq",
) -> list[dict]:
    """Bar fetcher for the indicator + backtest paths.

    Prefers Futu (`request_history_kline`) since OpenD is already running
    and isn't subject to Yahoo's per-IP rate limit. Falls back to yfinance
    when Futu refuses (unsupported market, OpenD offline, etc.) so the
    feature still works for users running the bridge without a live Futu
    quote subscription.

    Results are cached in SQLite keyed by (code, ktype, count, autype) so
    different adjustment modes don't collide and a bridge restart or a
    flurry of repeat indicator/backtest runs doesn't re-burn the upstream
    quota.
    """
    cache_key = f"bars:{code}:{ktype}:{int(count)}:{autype}"
    cached = cache_get(cache_key)
    if isinstance(cached, list):
        return cached
    try:
        bars = fetch_kline(code, ktype, count, autype)["bars"]
    except Exception as e:
        print(
            f"[bridge-py] futu kline failed for {code} {ktype}: {e!r} — falling back to yfinance",
            file=sys.stderr,
        )
        bars = fetch_bars_yf(code, ktype, count)
    if bars:
        cache_set(cache_key, bars, ttl_s=_bars_cache_ttl(ktype))
    return bars


def search_symbols(query: str) -> list[dict]:
    q = (query or "").strip().upper()
    if not q:
        return []
    return [{"code": f"US.{q}", "symbol": q, "name": q}]
