"""
OHLCV bars via yfinance — the fallback path used by `fetch_bars_smart` in
app.py when Futu refuses (unsupported market, missing subscription,
OpenD offline). Speaks to Yahoo directly so it works without OpenD.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from ._helpers import _safe_float, _yf_symbol, yf


# Maps the frontend's ktype enum to (yfinance interval, default lookback
# period). Note Yahoo's strict period caps for short intervals — 1m bars
# are only available for the last 7 days, 5m/15m/30m for 60 days, etc.
_YF_INTERVAL_MAP: dict[str, tuple[str, str]] = {
    'K_1M':  ('1m',  '7d'),
    'K_5M':  ('5m',  '60d'),
    'K_15M': ('15m', '60d'),
    'K_30M': ('30m', '60d'),
    'K_60M': ('60m', '730d'),
    'K_DAY': ('1d',  '5y'),
    'K_WEEK': ('1wk', '10y'),
    'K_MON': ('1mo', 'max'),
}

_INTRADAY_KTYPES = {'K_1M', 'K_5M', 'K_15M', 'K_30M', 'K_60M'}

# Yahoo aggressively rate-limits .history() — repeated backtest runs on the
# same symbol routinely trip a 429. We cache the full bar list per
# (symbol, interval) and slice with `tail(count)` on cache hits so different
# `count` requests share the underlying fetch. Daily TTL is 10 min;
# intraday is 60 s so the latest bar still refreshes during RTH.
_YF_BARS_CACHE: dict[tuple[str, str], dict] = {}
_YF_BARS_LOCK = threading.Lock()
_YF_BARS_TTL_DAILY_S = 10 * 60
_YF_BARS_TTL_INTRADAY_S = 60


def fetch_bars_yf(code: str, ktype: str = 'K_DAY', count: int = 250) -> list[dict]:
    """Pull OHLCV bars for a US ticker via yfinance, returning the same
    bar shape as the broker bridges (`time`, `open`, `high`, `low`,
    `close`, `volume`).

    Raises RuntimeError on configuration / mapping failures, returns []
    when Yahoo simply has no data for the symbol-period combo.
    """
    if yf is None:
        raise RuntimeError('yfinance not installed — pip install yfinance')
    sym = _yf_symbol(code)
    if not sym:
        raise RuntimeError(f'cannot map code to yfinance symbol: {code!r}')
    if ktype not in _YF_INTERVAL_MAP:
        raise RuntimeError(f'unsupported ktype: {ktype!r}')

    intraday = ktype in _INTRADAY_KTYPES
    ttl = _YF_BARS_TTL_INTRADAY_S if intraday else _YF_BARS_TTL_DAILY_S
    cache_key = (sym, ktype)
    now = datetime.now(timezone.utc).timestamp()

    with _YF_BARS_LOCK:
        cached = _YF_BARS_CACHE.get(cache_key)
        if cached and (now - cached['fetched_at']) < ttl:
            bars_all = cached['bars']
            return bars_all[-int(count):] if count > 0 else list(bars_all)

    interval, period = _YF_INTERVAL_MAP[ktype]
    try:
        df = yf.Ticker(sym).history(
            period=period,
            interval=interval,
            auto_adjust=False,
        )
    except Exception as e:
        # Serve stale cache rather than failing the whole backtest when
        # Yahoo throws a 429 — better to backtest on slightly old daily
        # bars than to bail out entirely.
        with _YF_BARS_LOCK:
            cached = _YF_BARS_CACHE.get(cache_key)
        if cached:
            bars_all = cached['bars']
            return bars_all[-int(count):] if count > 0 else list(bars_all)
        raise RuntimeError(f'yfinance history failed for {sym}: {e}') from e
    if df is None or df.empty:
        return []

    # Build the full bar list from the unsliced df so the cache holds the
    # widest window we've ever fetched; slice for the caller afterwards.
    bars_all: list[dict] = []
    for ts, row in df.iterrows():
        try:
            if intraday:
                # tz-aware Timestamp → epoch seconds
                t: int | str = int(ts.timestamp())
            else:
                t = ts.date().isoformat()
        except Exception:
            continue
        bars_all.append({
            'time': t,
            'open': _safe_float(row.get('Open')),
            'high': _safe_float(row.get('High')),
            'low': _safe_float(row.get('Low')),
            'close': _safe_float(row.get('Close')),
            'volume': _safe_float(row.get('Volume')),
            # turnover and changeRate aren't reported by yfinance; emit
            # zero placeholders so the bar shape matches /api/kline and
            # the frontend KlineChart's type contract.
            'turnover': 0.0,
            'changeRate': 0.0,
        })

    with _YF_BARS_LOCK:
        _YF_BARS_CACHE[cache_key] = {'bars': bars_all, 'fetched_at': now}
    return bars_all[-int(count):] if count > 0 else bars_all
