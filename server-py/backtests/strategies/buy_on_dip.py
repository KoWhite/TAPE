"""
Buy-on-Dip — buy when price drops by `drop_pct` from a recent peak,
hold for `hold_days` bars, then sell.

Default 5% drop, 20-bar hold (≈ 1 month). Slow but methodical — works
well in stocks with a strong long-term uptrend.
"""
from __future__ import annotations

import pandas as pd

from ..engine import simulate_long_only
from .base import StrategyContext, StrategyOutput


def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    drop_pct = float(params.get("drop_pct", 5.0)) / 100.0  # 5 → 0.05
    hold_days = int(params.get("hold_days", 20))
    lookback = int(params.get("lookback", 20))
    if drop_pct <= 0 or hold_days <= 0 or lookback <= 0:
        return StrategyOutput()

    bars = ctx.bars
    close = bars["close"].astype(float)
    rolling_max = close.rolling(lookback, min_periods=1).max()
    drawdown = (close - rolling_max) / rolling_max  # negative on dips

    # Stateful: when drawdown ≤ -drop_pct and we're flat, enter and hold
    # for hold_days bars (counting bars-in-position).
    pos: list[float] = []
    reasons: dict[int, str] = {}
    bars_held = 0
    in_pos = False
    n = len(close)
    for i in range(n):
        if not in_pos and drawdown.iloc[i] <= -drop_pct:
            in_pos = True
            bars_held = 0
            reasons[i] = (
                f"close down {drawdown.iloc[i] * 100:.1f}% from {lookback}-bar peak"
            )
        elif in_pos:
            bars_held += 1
            if bars_held >= hold_days:
                in_pos = False
                bars_held = 0
                reasons[i] = f"{hold_days}-bar hold complete"
        pos.append(1.0 if in_pos else 0.0)

    position = pd.Series(pos)
    trades, equity, times = simulate_long_only(
        bars, position, ctx.initial_capital, ctx.symbol, reason_for=reasons,
    )
    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=times,
    )
