"""
Buy & Hold — the baseline every other strategy must beat to justify
itself. Buys at the first bar's open with all cash, holds to the end.
"""
from __future__ import annotations

import pandas as pd

from ..engine import simulate_long_only
from .base import StrategyContext, StrategyOutput


def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    n = len(ctx.bars)
    if n < 2:
        return StrategyOutput()

    # Position is 1.0 from the very first bar onward — long-only
    # simulator will buy at bar[1] open and hold.
    position = pd.Series([1.0] * n)

    trades, equity, times = simulate_long_only(
        ctx.bars,
        position,
        ctx.initial_capital,
        ctx.symbol,
        reason_for={0: "buy & hold entry"},
    )
    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=times,
    )
