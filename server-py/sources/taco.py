"""TACO pressure index assembler.

Composite "Trump pressure index" — sums the N-trading-day change of five
components, each sign-flipped so that "bad for Trump" is positive.

Mixed-unit note:
    Equity / oil contributions are in **percent** (price returns).
    Yield / inflation / approval contributions are in **percentage points**
    (level differences). They are added together as in the reference chart;
    this is an intentional simplification that treats both kinds of moves
    as comparable pressure signals. It is a signal, not a measurement —
    don't read the absolute number as a precise %.
"""
from __future__ import annotations

import json
import time
from bisect import bisect_right
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal, TypedDict

from ._helpers import _safe_float, _to_date, now_iso, yf
from .approval import fetch_approval_series
from .macro_fred import fetch_fred_series

# db.cache is a SQLite-backed TTL cache that survives bridge restarts.
# We need that here because Yahoo's 429 rate limiting is sticky — once
# tripped, every restart re-fetch hits the same limit. Persisted bars
# let the chart keep rendering through transient blocks.
try:
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from db import cache_get, cache_set  # type: ignore
except Exception:
    cache_get = None  # type: ignore
    cache_set = None  # type: ignore


DEFAULT_WINDOW = 20
DEFAULT_LOOKBACK_DAYS = 540


class ComponentDef(TypedDict):
    key: str
    label: str
    source_kind: Literal["approval", "fred", "yf"]
    source_id: str | None
    sign: int
    change_kind: Literal["pct", "diff"]
    scale: float


# Sign flips so that "bad for Trump" reads positive:
#   approval drops  -> pressure up   (sign=-1 on diff)
#   stocks fall     -> pressure up   (sign=-1 on pct return)
#   yields rise     -> pressure up   (sign=+1 on diff)
#   inflation rises -> pressure up   (sign=+1 on diff)
#   oil rises       -> pressure up   (sign=+1 on pct return)
#
# DGS10 / T5YIE are already in *percent* units (e.g. 4.20), so the right
# move is the level *difference* in percentage points — NOT a relative
# pct change. Using pct here would treat a 4.20 -> 4.35 move as +3.6% of
# contribution, which is wildly oversized.
#
# `scale` rescales each contribution so mixed-unit components are
# comparable in the sum. The pp-diff components (approval, yields,
# inflation) move ±~1 over 20 trading days; the pct-return components
# (S&P 500, Brent) move ±several-to-ten percent over the same window.
# Added raw, Brent alone dominates the total and flips its sign (a -10%
# oil move single-handedly drags the index negative). We compress the
# pct returns by 0.1 so a 10% move contributes ~1.0 — the same order of
# magnitude as a 1pp rate move — matching the reference chart's scale
# where S&P / oil contributions sit in the ±0.x..±1 range, not ±10.
COMPONENTS: list[ComponentDef] = [
    {
        "key": "approval",
        "label": "Net Approval",
        "source_kind": "approval",
        "source_id": None,
        "sign": -1,
        "change_kind": "diff",
        "scale": 1.0,
    },
    {
        "key": "sp500",
        "label": "S&P 500",
        "source_kind": "yf",
        "source_id": "^GSPC",
        "sign": -1,
        "change_kind": "pct",
        "scale": 0.1,
    },
    {
        "key": "ust10y",
        "label": "10Y UST",
        "source_kind": "fred",
        "source_id": "DGS10",
        "sign": 1,
        "change_kind": "diff",
        "scale": 1.0,
    },
    {
        "key": "inflation",
        "label": "5Y Breakeven Inflation",
        "source_kind": "fred",
        "source_id": "T5YIE",
        "sign": 1,
        "change_kind": "diff",
        "scale": 1.0,
    },
    {
        "key": "brent",
        "label": "Brent Spot",
        "source_kind": "fred",
        "source_id": "DCOILBRENTEU",
        "sign": 1,
        "change_kind": "pct",
        "scale": 0.1,
    },
]

THRESHOLDS = [
    {"min": 7, "label": "Extreme Pressure", "color": "rgba(244,67,54,0.16)"},
    {"min": 3, "label": "Pressure", "color": "rgba(255,152,0,0.14)"},
    {"min": 0, "label": "Watch", "color": "rgba(255,235,180,0.18)"},
    {"min": -3, "label": "Comfort", "color": "rgba(76,175,80,0.14)"},
    {"min": -999, "label": "Expansion", "color": "rgba(46,125,154,0.16)"},
]

EVENTS_PATH = Path(__file__).resolve().parents[1] / "data" / "taco_events.json"


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _default_start() -> date:
    return date.today() - timedelta(days=DEFAULT_LOOKBACK_DAYS)


# Cache TTLs for the yfinance index pull. Daily bars only refresh once
# per close, so 6h-fresh is plenty. The stale window is much longer —
# Yahoo 429s can persist for hours, and a slightly out-of-date pressure
# index is far better than no chart at all.
_YF_FRESH_TTL_S = 6 * 60 * 60        # 6 hours — counted as "fresh enough", skip refetch
_YF_STALE_TTL_S = 14 * 24 * 60 * 60  # 14 days — kept on disk for 429 fallback

# Retry shape for the actual yfinance call. Indices like ^GSPC respond
# fast when not rate-limited, so we don't need long backoffs; we just
# need to not give up on the first 429.
_YF_RETRY_DELAYS_S = (0, 2, 5)


def _is_rate_limit(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "too many requests" in msg or "rate limit" in msg or "429" in msg


def _yf_fetch_raw(symbol: str, start: date) -> list[tuple[date, float]]:
    if yf is None:
        raise RuntimeError("yfinance is required for TACO market history")
    last_exc: Exception | None = None
    for delay in _YF_RETRY_DELAYS_S:
        if delay:
            time.sleep(delay)
        try:
            hist = yf.Ticker(symbol).history(
                start=start.isoformat(),
                auto_adjust=False,
                actions=False,
            )
        except Exception as e:
            last_exc = e
            if not _is_rate_limit(e):
                # Non-429 error — don't waste retries on it.
                break
            continue
        if hist is None or getattr(hist, "empty", True):
            raise RuntimeError(f"yfinance returned no history for {symbol}")
        col = "Adj Close" if "Adj Close" in hist.columns else "Close"
        points: list[tuple[date, float]] = []
        for idx, row in hist.iterrows():
            d = _to_date(idx)
            v = _safe_float(row.get(col))
            if d and v > 0:
                points.append((d, v))
        return sorted(points, key=lambda p: p[0])
    raise RuntimeError(
        f"yfinance history failed for {symbol}: {last_exc}"
    ) from last_exc


def _fetch_yf_close_points(symbol: str, start: date) -> list[tuple[date, float]]:
    """Fetch daily closes with a two-tier persistent cache:
      1. If a cached payload is < 6h old, return it (no network).
      2. Otherwise try yfinance with retries. On success, refresh cache.
      3. On 429 / network failure, fall back to the cache even if older
         than 6h (up to 14d). Better stale than nothing.
    """
    cache_key = f"taco:yf:{symbol}:{start.isoformat()}"
    cached: dict | None = None
    if cache_get is not None:
        try:
            cached = cache_get(cache_key)
        except Exception:
            cached = None

    now = time.time()
    if cached and isinstance(cached, dict):
        fetched_at = float(cached.get("fetched_at") or 0)
        if now - fetched_at < _YF_FRESH_TTL_S and cached.get("points"):
            return [(date.fromisoformat(d), float(v)) for d, v in cached["points"]]

    try:
        points = _yf_fetch_raw(symbol, start)
    except Exception as e:
        # Stale cache fallback — only for rate-limit / transient failures.
        # If yfinance is reporting "no such symbol", cached data is just
        # as wrong as a fresh fetch, so let it propagate.
        if cached and isinstance(cached, dict) and cached.get("points") and _is_rate_limit(e):
            return [(date.fromisoformat(d), float(v)) for d, v in cached["points"]]
        raise

    if cache_set is not None and points:
        try:
            cache_set(
                cache_key,
                {
                    "fetched_at": now,
                    "points": [(d.isoformat(), v) for d, v in points],
                },
                ttl_s=_YF_STALE_TTL_S,
            )
        except Exception:
            pass  # Cache is best-effort; never let it break the path.
    return points


def _macro_points(series: dict) -> list[tuple[date, float]]:
    points: list[tuple[date, float]] = []
    raw_points = series.get("observations") or series.get("points") or []
    for point in raw_points:
        d = _parse_date(point.get("date"))
        v = point.get("value")
        try:
            value = float(v)
        except (TypeError, ValueError):
            continue
        if d:
            points.append((d, value))
    return sorted(points, key=lambda p: p[0])


def _fetch_component_points(
    component: ComponentDef, start: date
) -> tuple[list[tuple[date, float]], str | None]:
    """Returns (points, source_error). source_error is non-None when fetch
    failed but we want the rest of the index to keep working."""
    try:
        if component["source_kind"] == "yf":
            source_id = component["source_id"]
            if not source_id:
                return [], "missing source id"
            return _fetch_yf_close_points(source_id, start), None
        if component["source_kind"] == "fred":
            source_id = component["source_id"]
            if not source_id:
                return [], "missing source id"
            return _macro_points(fetch_fred_series(source_id, start.isoformat())), None
        if component["source_kind"] == "approval":
            return _macro_points(fetch_approval_series(start.isoformat())), None
    except Exception as e:
        # Soft-fail for *non-base* components: TACO is multi-source by design,
        # losing one (e.g. PSI page changes shape, FRED rate-limits T5YIE)
        # should not kill the whole chart. The error is surfaced via
        # sourceStatus so the UI can show "Approval source unavailable".
        return [], f"{type(e).__name__}: {e}"
    return [], "unknown source kind"


def _asof_series(points: list[tuple[date, float]], dates: list[date]) -> list[float | None]:
    """Forward-fill each external series to the base trading-day index.
    bisect_right(d) - 1 = last point on or before d, i.e. the most recent
    observation visible on date d (no look-ahead)."""
    if not points:
        return [None for _ in dates]
    point_dates = [p[0] for p in points]
    out: list[float | None] = []
    for d in dates:
        idx = bisect_right(point_dates, d) - 1
        out.append(points[idx][1] if idx >= 0 else None)
    return out


def _contribution(
    values: list[float | None],
    idx: int,
    window: int,
    sign: int,
    change_kind: Literal["pct", "diff"],
    scale: float,
) -> float | None:
    if idx < window:
        return None
    cur = values[idx]
    prev = values[idx - window]
    if cur is None or prev is None:
        return None
    if change_kind == "pct":
        if prev == 0:
            return None
        raw = (cur - prev) / prev * 100.0
    else:
        raw = cur - prev
    return raw * sign * scale


def _load_events(start: date, end: date) -> list[dict]:
    if not EVENTS_PATH.exists():
        return []
    try:
        raw = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    events: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        d = _parse_date(item.get("date"))
        label = item.get("label")
        tone = item.get("tone")
        if not d or not isinstance(label, str):
            continue
        if d < start or d > end:
            continue
        events.append({
            "date": d.isoformat(),
            "label": label,
            "tone": "red" if tone == "red" else "gray",
        })
    return sorted(events, key=lambda e: e["date"])


def fetch_taco_index(window: int = DEFAULT_WINDOW, start: str | None = None) -> dict:
    """Fetch and assemble the TACO pressure index payload.

    Returns a dict with `series` (per-date contributions), `total` (latest
    sum), `componentsLatest`, `thresholds`, `events`, and `sourceStatus`
    (which components failed to load, if any).
    """
    try:
        lookback = max(1, min(int(window), 120))
    except (TypeError, ValueError):
        lookback = DEFAULT_WINDOW

    requested_start = _parse_date(start) or _default_start()
    # Need extra history before requested_start so the first plotted point
    # already has a valid N-day lookback. lookback * 5 ~= calendar days
    # for N trading days, plus a 90-day cushion.
    fetch_start = requested_start - timedelta(days=max(90, lookback * 5))

    # S&P 500 is the base calendar — every other series is forward-filled to
    # its trading days. Picked because it's the most reliable daily series
    # in the basket; if it fails we genuinely can't build the index.
    sp500_def = next(c for c in COMPONENTS if c["key"] == "sp500")
    base_points, base_error = _fetch_component_points(sp500_def, fetch_start)
    if base_error:
        raise RuntimeError(f"S&P 500 base series failed: {base_error}")
    base_dates_all = [d for d, _ in base_points]
    base_dates = [d for d in base_dates_all if d >= requested_start]
    if len(base_dates_all) <= lookback or not base_dates:
        raise RuntimeError("Not enough S&P 500 history to calculate TACO index")

    component_values: dict[str, list[float | None]] = {}
    source_status: dict[str, str | None] = {}
    for component in COMPONENTS:
        if component["key"] == "sp500":
            points = base_points
            err: str | None = None
        else:
            points, err = _fetch_component_points(component, fetch_start)
        component_values[component["key"]] = _asof_series(points, base_dates_all)
        source_status[component["key"]] = err

    series: list[dict] = []
    for idx, d in enumerate(base_dates_all):
        if d < requested_start:
            continue
        components: dict[str, float | None] = {}
        total = 0.0
        has_value = False
        for component in COMPONENTS:
            key = component["key"]
            value = _contribution(
                component_values[key],
                idx,
                lookback,
                component["sign"],
                component["change_kind"],
                component["scale"],
            )
            components[key] = round(value, 4) if value is not None else None
            if value is not None:
                total += value
                has_value = True
        if has_value:
            series.append({
                "date": d.isoformat(),
                "total": round(total, 4),
                "components": components,
            })

    if not series:
        raise RuntimeError("Not enough component history to calculate TACO index")

    latest = series[-1]
    start_for_events = _parse_date(series[0]["date"]) or requested_start
    end_for_events = _parse_date(latest["date"]) or date.today()

    return {
        "window": lookback,
        "asOf": latest["date"],
        "total": latest["total"],
        "componentsLatest": latest["components"],
        "series": series,
        "thresholds": THRESHOLDS,
        "events": _load_events(start_for_events, end_for_events),
        "componentsMeta": [
            {
                "key": c["key"],
                "label": c["label"],
                "source": c["source_id"] or c["source_kind"],
                "changeKind": c["change_kind"],
                "sign": c["sign"],
                "scale": c["scale"],
                # Contributions are scaled index points, not raw % / pp,
                # so report a neutral "pts" suffix. The raw nature of each
                # move (return vs level diff) is still in `changeKind`.
                "unit": "pts",
            }
            for c in COMPONENTS
        ],
        "sourceStatus": source_status,
        "lastUpdated": now_iso(),
    }
