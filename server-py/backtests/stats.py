"""
Pure-function performance metrics.

Inputs: equity curve (list of values), benchmark curve, list of trades.
Outputs: a `BacktestStats` instance.

No I/O, no globals — easy to test in isolation. All percentages are
returned as decimals (0.15 = +15%) per contract.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .schemas import BacktestStats, Trade

# Rough trading-days-per-year. We compute annualization from the actual
# number of bars relative to the calendar window, but for daily resampled
# returns this is the standard scaling factor.
TRADING_DAYS = 252


def _safe_div(a: float, b: float) -> float:
    if b == 0 or not math.isfinite(b):
        return 0.0
    return a / b


def _to_returns(equity: pd.Series) -> pd.Series:
    """Bar-to-bar simple returns from an equity series."""
    if len(equity) < 2:
        return pd.Series([], dtype=float)
    return equity.pct_change().dropna()


def _annualization_factor(n_bars: int, days_span: float) -> float:
    """Convert a per-bar Sharpe to an annualized one. We prefer the
    actual time span (days_span) over a hard `sqrt(252)` so weekly /
    monthly / hourly bars are scaled correctly automatically."""
    if n_bars <= 1 or days_span <= 0:
        return math.sqrt(TRADING_DAYS)
    bars_per_year = n_bars * 365.0 / days_span
    return math.sqrt(max(1.0, bars_per_year))


def compute_stats(
    equity: list[float],
    times: list,
    trades: list[Trade],
    benchmark_equity: list[float],
) -> BacktestStats:
    """Build the full BacktestStats payload.

    `times` is the bar timestamps aligned with `equity` and
    `benchmark_equity`; required for annualization scaling.
    """
    if len(equity) < 2:
        return BacktestStats(
            total_return=0.0,
            annualized_return=0.0,
            sharpe=0.0,
            sortino=0.0,
            max_drawdown=0.0,
            win_rate=0.0,
            avg_win=0.0,
            avg_loss=0.0,
            profit_factor=0.0,
            num_trades=len(trades),
            benchmark_return=0.0,
            alpha=0.0,
        )

    eq = pd.Series(equity, dtype=float)
    bench = pd.Series(benchmark_equity, dtype=float) if benchmark_equity else None

    # ── Returns ─────────────────────────────────────────────────────
    initial = eq.iloc[0] if eq.iloc[0] != 0 else 1.0
    total_return = (eq.iloc[-1] - initial) / initial

    # Calendar span — prefer ISO date strings; fall back to bar-count.
    days_span = _calendar_span_days(times)
    n_bars = len(eq)

    if days_span > 0:
        years = days_span / 365.0
        annualized = (1 + total_return) ** (1 / max(years, 1e-9)) - 1 if years > 0 else 0.0
    else:
        annualized = 0.0

    # ── Sharpe / Sortino ────────────────────────────────────────────
    rets = _to_returns(eq)
    factor = _annualization_factor(n_bars, days_span)

    if len(rets) > 1 and rets.std(ddof=0) > 0:
        sharpe = float(rets.mean() / rets.std(ddof=0) * factor)
    else:
        sharpe = 0.0

    downside = rets[rets < 0]
    if len(downside) > 1 and downside.std(ddof=0) > 0:
        sortino = float(rets.mean() / downside.std(ddof=0) * factor)
    else:
        sortino = 0.0

    # ── Max drawdown ────────────────────────────────────────────────
    running_peak = eq.cummax()
    dd = (eq - running_peak) / running_peak.replace(0, np.nan)
    max_dd = float(-dd.min()) if not dd.empty else 0.0
    if not math.isfinite(max_dd):
        max_dd = 0.0

    # ── Trade-level stats ───────────────────────────────────────────
    closed = [t for t in trades if t.exit_price is not None]
    wins = [t for t in closed if t.pnl > 0]
    losses = [t for t in closed if t.pnl < 0]
    win_rate = _safe_div(len(wins), len(closed))
    avg_win = float(np.mean([t.pnl_pct for t in wins])) if wins else 0.0
    avg_loss = float(np.mean([t.pnl_pct for t in losses])) if losses else 0.0
    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))
    profit_factor = _safe_div(gross_profit, gross_loss)

    # ── Benchmark comparison ────────────────────────────────────────
    if bench is not None and len(bench) >= 2 and bench.iloc[0] != 0:
        bench_return = float((bench.iloc[-1] - bench.iloc[0]) / bench.iloc[0])
    else:
        bench_return = 0.0
    alpha = total_return - bench_return

    return BacktestStats(
        total_return=float(total_return),
        annualized_return=float(annualized),
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=max_dd,
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        profit_factor=profit_factor,
        num_trades=len(closed),
        benchmark_return=bench_return,
        alpha=alpha,
    )


def _calendar_span_days(times: list) -> float:
    """Calendar days from the first to the last bar's timestamp.

    Handles both ISO date strings ('2024-01-15') and Unix epoch seconds
    (1700000000). Returns 0 when input is too short or unparseable —
    the caller falls back to a default annualization factor."""
    if len(times) < 2:
        return 0.0
    start, end = times[0], times[-1]
    try:
        if isinstance(start, str):
            ds = pd.Timestamp(start)
        else:
            ds = pd.Timestamp(int(start), unit="s")
        if isinstance(end, str):
            de = pd.Timestamp(end)
        else:
            de = pd.Timestamp(int(end), unit="s")
        return float((de - ds).total_seconds() / 86400.0)
    except Exception:
        return 0.0


def drawdown_series(equity: list[float], times: list) -> list[tuple]:
    """Compute the drawdown series (negative decimals, peak = 0) so it
    can be charted as a red area beneath the equity curve."""
    if len(equity) < 1:
        return []
    eq = pd.Series(equity, dtype=float)
    peak = eq.cummax().replace(0, np.nan)
    dd = (eq - peak) / peak
    out: list[tuple] = []
    for t, v in zip(times, dd.tolist()):
        if v is None or (isinstance(v, float) and not math.isfinite(v)):
            out.append((t, 0.0))
        else:
            out.append((t, float(v)))
    return out
