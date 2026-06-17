"""
Post-Earnings — buy N trading days after each earnings release and hold
for M trading days, then exit.

Driven by yfinance's historical earnings dates. Each report becomes one
trade; trades that would overlap collapse into a single hold (the new
entry signal is ignored if we're already in position).

US-only — yfinance earnings coverage outside the US is sparse, and the
strategy module deliberately fails fast on non-US codes rather than
silently returning zero trades.
"""
from __future__ import annotations

import sys
from datetime import date, datetime

import pandas as pd

from sources import fetch_earnings_for, _yf_symbol

from ..engine import simulate_long_only
from .base import StrategyContext, StrategyOutput


def _to_date(value) -> "date | None":
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError):
        return None


def _earnings_dates(symbol: str, beat_only: bool) -> list[date]:
    """Pull historical earnings release dates. When `beat_only`, drop
    rows where the EPS surprise was non-positive — yfinance encodes
    surprise as a percent (already in the `surprisePct` field)."""
    try:
        payload = fetch_earnings_for(symbol)
    except Exception as e:
        print(f"[post_earnings] fetch_earnings_for({symbol}) failed: {e!r}", file=sys.stderr)
        return []
    out: list[date] = []
    for row in payload.get("history") or []:
        d = _to_date(row.get("date"))
        if d is None:
            continue
        if beat_only:
            surprise = row.get("surprisePct")
            if surprise is None or float(surprise) <= 0:
                continue
        out.append(d)
    return sorted(out)


def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    entry_lag = max(0, int(params.get("entry_lag_days", 1)))
    hold_days = max(1, int(params.get("hold_days", 20)))
    beat_only = bool(int(params.get("only_beats", 0)))

    bars = ctx.bars
    if bars.empty:
        return StrategyOutput()

    # Map ISO date → bar index. We work on calendar dates (yfinance
    # earnings rows are dated; bars are dated too) so we can sidestep
    # NYSE-vs-yfinance trading-day arithmetic.
    times = bars["time"].astype(str)

    yf_sym = _yf_symbol(ctx.symbol) or ctx.symbol
    events = _earnings_dates(yf_sym, beat_only=beat_only)
    if not events:
        return StrategyOutput()

    # For each earnings date, find the first bar index ≥ event_date and
    # advance by entry_lag bars. That handles weekend / pre-open releases
    # naturally — the first tradable bar absorbs the announcement.
    iso_index = list(times)

    def first_bar_on_or_after(d: date) -> int | None:
        target = d.isoformat()
        # Linear scan is fine — events ≤ ~32 per symbol, iso_index ≤ 1500.
        for i, t in enumerate(iso_index):
            if t >= target:
                return i
        return None

    n = len(bars)
    pos = [0.0] * n
    reasons: dict[int, str] = {}
    in_pos = False
    bars_held = 0
    next_event_idx = 0
    entry_points: list[tuple[int, date]] = []

    for d in events:
        idx0 = first_bar_on_or_after(d)
        if idx0 is None:
            continue
        entry_idx = idx0 + entry_lag
        if entry_idx >= n:
            continue
        entry_points.append((entry_idx, d))

    # Walk bars, applying entries in order; ignore overlapping entries
    # to keep the strategy simple (a fresh hold from a new entry would
    # require closing and reopening on the same bar otherwise).
    sorted_entries = sorted(entry_points, key=lambda e: e[0])
    for i in range(n):
        if not in_pos:
            while (
                next_event_idx < len(sorted_entries)
                and sorted_entries[next_event_idx][0] < i
            ):
                next_event_idx += 1
            if (
                next_event_idx < len(sorted_entries)
                and sorted_entries[next_event_idx][0] == i
            ):
                in_pos = True
                bars_held = 0
                event_date = sorted_entries[next_event_idx][1]
                reasons[i] = (
                    f"earnings {event_date.isoformat()}"
                    f" +{entry_lag}d entry"
                )
                next_event_idx += 1
        else:
            bars_held += 1
            if bars_held >= hold_days:
                in_pos = False
                bars_held = 0
                reasons[i] = f"{hold_days}-bar hold complete"
        pos[i] = 1.0 if in_pos else 0.0

    position = pd.Series(pos)
    trades, equity, time_axis = simulate_long_only(
        bars, position, ctx.initial_capital, ctx.symbol, reason_for=reasons,
    )
    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=time_axis,
    )
