"""
Sector / industry data sources.

Two endpoints:
  - `fetch_sector_etfs()` — quotes for the 11 SPDR Select Sector ETFs,
    used by the board-level heatmap. Parallel fan-out, 60s TTL.
  - `fetch_sectors(codes)` — sector/industry/marketCap per symbol via
    yfinance `info`. Sequential, 24h TTL (sector classification is static).
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from ._helpers import _opt_float, _yf_symbol, now_iso, yf


# ── Sector / industry classification (yfinance) ────────────────────────
# Sector data is essentially static — once Apple is "Technology" it's not
# going to switch GICS codes mid-quarter. 24h TTL keeps the heatmap snappy
# while still picking up newly-listed symbols within a day.
_SECTOR_CACHE: dict[str, dict] = {}
_SECTOR_LOCK = threading.Lock()
_SECTOR_TTL_S = 24 * 60 * 60


def _fetch_sector_raw(sym: str) -> dict:
    if yf is None:
        return {"sector": None, "industry": None, "marketCap": None}
    try:
        info = yf.Ticker(sym).info or {}
    except Exception:
        return {"sector": None, "industry": None, "marketCap": None}
    return {
        "sector": info.get("sector") or info.get("sectorKey") or None,
        "industry": info.get("industry") or info.get("industryKey") or None,
        "marketCap": _opt_float(info.get("marketCap")),
    }


# ── SPDR sector ETFs (board-level heatmap) ─────────────────────────────
# The 11 SPDR Select Sector ETFs together cover the S&P 500's GICS
# classification — each tracks one sector. Wall Street uses these as the
# canonical "how is each sector doing today" proxies, so they make a
# perfect data source for a board-level heatmap that needs no broker API.
SECTOR_ETFS: list[tuple[str, str]] = [
    ('XLK', 'Technology'),
    ('XLF', 'Financials'),
    ('XLV', 'Health Care'),
    ('XLY', 'Consumer Discretionary'),
    ('XLC', 'Communication Services'),
    ('XLI', 'Industrials'),
    ('XLP', 'Consumer Staples'),
    ('XLE', 'Energy'),
    ('XLU', 'Utilities'),
    ('XLB', 'Materials'),
    ('XLRE', 'Real Estate'),
]

_SECTOR_ETF_CACHE: dict = {'data': None, 'fetched_at': 0.0}
_SECTOR_ETF_LOCK = threading.Lock()
# 60s TTL — short enough that the heatmap feels live during market hours
# while still buffering bursts of clients that mount the homepage at once.
_SECTOR_ETF_TTL_S = 60


def _fetch_sector_etf_one(sym: str) -> dict | None:
    """Pull current quote + day OHLC for one ETF via yfinance fast_info.
    Returns None on any failure so the caller can skip it cleanly."""
    if yf is None:
        return None
    try:
        fi = yf.Ticker(sym).fast_info
    except Exception:
        return None

    def _g(name: str) -> float | None:
        # fast_info exposes both attribute and dict-like access depending on
        # yfinance version — try both.
        try:
            v = getattr(fi, name, None)
            if v is None and hasattr(fi, '__getitem__'):
                v = fi[name]  # type: ignore[index]
        except Exception:
            v = None
        return _opt_float(v)

    last = _g('last_price')
    prev = _g('previous_close')
    if last is None or prev is None or prev == 0:
        return None

    change = last - prev
    return {
        'symbol': sym,
        'last': last,
        'prevClose': prev,
        'change': change,
        'changePct': change / prev,
        'open': _g('open') or 0.0,
        'dayHigh': _g('day_high') or 0.0,
        'dayLow': _g('day_low') or 0.0,
        'volume': _g('last_volume') or 0.0,
        'marketCap': _g('market_cap') or 0.0,
    }


def fetch_sector_etfs() -> dict:
    """Live quotes for the 11 SPDR Select Sector ETFs. Used by the
    board-level heatmap on the home page; needs no broker token because
    yfinance hits Yahoo's public quote endpoint directly.

    Cache-first per-ETF lookups are fanned out via ThreadPoolExecutor —
    11 sequential round-trips would take ~5s on a cold cache, parallel
    drops it to ~600ms."""
    with _SECTOR_ETF_LOCK:
        now = datetime.now(timezone.utc).timestamp()
        cached = _SECTOR_ETF_CACHE.get('data')
        fetched_at = _SECTOR_ETF_CACHE.get('fetched_at', 0.0)
        if cached is not None and (now - float(fetched_at)) < _SECTOR_ETF_TTL_S:
            return cached

    if yf is None:
        return {'available': False, 'sectors': [], 'cachedAt': now_iso()}

    from concurrent.futures import ThreadPoolExecutor

    syms = [s for s, _ in SECTOR_ETFS]
    with ThreadPoolExecutor(max_workers=min(8, len(syms))) as ex:
        results = list(ex.map(_fetch_sector_etf_one, syms))

    sectors: list[dict] = []
    for (sym, name), data in zip(SECTOR_ETFS, results):
        if data is None:
            continue
        sectors.append({**data, 'name': name})

    payload = {
        'available': True,
        'sectors': sectors,
        'cachedAt': now_iso(),
    }
    with _SECTOR_ETF_LOCK:
        _SECTOR_ETF_CACHE['data'] = payload
        _SECTOR_ETF_CACHE['fetched_at'] = now
    return payload


def fetch_sectors(codes: list[str]) -> dict:
    """Resolve sector / industry / market-cap for each code. Returns a
    `{code: {sector, industry, marketCap}}` map — values can be null if
    yfinance has no coverage (common for non-US tickers and ETFs).

    Cache-first per symbol — a watchlist that's been opened before pays
    only the cost of the first lookup. yfinance's `info` dict is slow
    (~500ms each) so the cache matters."""
    out: dict[str, dict] = {}
    if not codes:
        return {"available": yf is not None, "results": out, "cachedAt": now_iso()}

    now = datetime.now(timezone.utc).timestamp()
    needed: list[tuple[str, str]] = []  # (code, symbol)
    with _SECTOR_LOCK:
        for code in codes:
            sym = _yf_symbol(code)
            if not sym:
                out[code] = {"sector": None, "industry": None, "marketCap": None}
                continue
            cached = _SECTOR_CACHE.get(sym)
            if cached and (now - cached["fetched_at"]) < _SECTOR_TTL_S:
                out[code] = cached["data"]
            else:
                needed.append((code, sym))

    # Sequential lookup is fine here — we only fetch the long tail; warm
    # caches collapse to zero work. Could be parallelized later if it ever
    # becomes a bottleneck for first-time loads.
    for code, sym in needed:
        data = _fetch_sector_raw(sym)
        with _SECTOR_LOCK:
            _SECTOR_CACHE[sym] = {"data": data, "fetched_at": now}
        out[code] = data

    return {
        "available": yf is not None,
        "results": out,
        "cachedAt": now_iso(),
    }
