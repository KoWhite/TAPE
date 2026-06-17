"""
Shared utilities used across the sources package.

Everything else in `sources/` depends on these — keep the surface small
(coercion + symbol mapping + tz-aware now). No network, no SDK imports.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timezone

# yfinance is optional — features that need it (earnings, news, analyst,
# sectors, yf bars) each check `yf is None` before doing work. We import
# it here so every submodule sees the same singleton.
try:
    import yfinance as yf  # type: ignore
except ImportError:
    yf = None  # type: ignore


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(v) -> float:
    """Coerce any cell to a JSON-safe float — NaN/Inf/missing all become 0.

    Many SDKs return NaN for absent fields (e.g. PE on ETFs), and Python's
    json.dumps emits the literal `NaN`, which browsers reject.
    """
    if v in (None, "", "N/A"):
        return 0.0
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(f):
        return 0.0
    return f


def _opt_float(v) -> float | None:
    """Like _safe_float but returns None for missing/garbage instead of 0."""
    try:
        f = float(v)
        return f if f == f else None  # filter NaN
    except (TypeError, ValueError):
        return None


def _to_date(value) -> "date | None":
    """Coerce yfinance's mixed timestamp/date representations into a plain
    ``date``. Handles pandas Timestamp, datetime, date, and naive/tz-aware
    datetimes. Returns None for NaT/None/garbage so the caller can skip."""
    if value is None:
        return None
    try:
        if value != value:  # type: ignore[comparison-overlap]
            return None
    except Exception:
        pass
    try:
        if hasattr(value, "to_pydatetime"):
            value = value.to_pydatetime()
    except Exception:
        return None
    if isinstance(value, datetime):
        return value.date()
    if hasattr(value, "year") and hasattr(value, "month") and hasattr(value, "day"):
        try:
            return date(value.year, value.month, value.day)
        except Exception:
            return None
    return None


def _yf_symbol(code: str) -> str | None:
    """Map a broker-style code to a Yahoo Finance ticker. Only US tickers
    are supported today — HK/CN earnings via yfinance are sparse."""
    if not code or "." not in code:
        return None
    parts = code.split(".", 1)
    if parts[0] == "US":
        sym = parts[1]
    elif parts[1] == "US":
        sym = parts[0]
    else:
        return None
    sym = sym.lstrip(".")  # strip leading dot from index codes (US..DJI)
    return sym or None
