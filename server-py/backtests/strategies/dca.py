"""
Dollar-Cost Averaging — buy a fixed dollar amount every N bars.

Defaults to monthly (~21 trading-day intervals) at $500. The strategy
never sells; the final equity is mark-to-market on the last bar plus
any leftover cash.
"""
from __future__ import annotations

from ..engine import simulate_dca
from .base import StrategyContext, StrategyOutput


def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    interval = int(params.get("interval", 21))
    amount = float(params.get("amount", 500))
    if interval <= 0 or amount <= 0:
        return StrategyOutput()

    n = len(ctx.bars)
    # Build a buy schedule: every `interval` bars starting from bar 0
    # (or 1 to give the first bar's open as entry — bar 0 is fine since
    # simulate_dca buys at THIS bar's open, not next-bar).
    schedule: list[tuple[int, float]] = []
    for i in range(0, n, interval):
        schedule.append((i, amount))

    trades, equity, times = simulate_dca(
        ctx.bars,
        schedule,
        ctx.initial_capital,
        ctx.symbol,
    )
    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=times,
    )
