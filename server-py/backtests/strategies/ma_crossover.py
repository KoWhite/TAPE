"""
Moving-Average Crossover — classic trend-follower.

  Long when fast MA crosses above slow MA.
  Flat when fast MA crosses below slow MA.

Default 20/50 SMA — middle-ground between scalping and trend-of-the-year.
"""
from __future__ import annotations

import pandas as pd

from ..engine import simulate_long_only
from ..schemas import EquityPoint, NamedSeries
from .base import StrategyContext, StrategyOutput


def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    fast = int(params.get("fast", 20))
    slow = int(params.get("slow", 50))
    if fast <= 0 or slow <= 0 or fast >= slow:
        # Defensive — bad params just produce a flat strategy.
        return StrategyOutput()

    bars = ctx.bars
    close = bars["close"].astype(float)

    fast_ma = close.rolling(fast, min_periods=fast).mean()
    slow_ma = close.rolling(slow, min_periods=slow).mean()

    # Position: 1 when fast > slow, 0 otherwise. Both NaN bars stay at 0
    # so warm-up doesn't trigger a phantom entry.
    position = ((fast_ma > slow_ma) & fast_ma.notna() & slow_ma.notna()).astype(float)

    # Annotate transitions for trade.reason — easier to read in the UI.
    reasons: dict[int, str] = {}
    prev = 0.0
    for i, v in enumerate(position.tolist()):
        if v > prev:
            reasons[i] = f"fast({fast}) crossed above slow({slow})"
        elif v < prev:
            reasons[i] = f"fast({fast}) crossed below slow({slow})"
        prev = v

    trades, equity, times = simulate_long_only(
        bars, position, ctx.initial_capital, ctx.symbol, reason_for=reasons,
    )

    # Publish the two MAs so the UI can overlay them on the equity chart.
    extras = [
        NamedSeries(
            name=f"SMA({fast})",
            pane="separate",
            points=[
                EquityPoint(time=t, value=float(v) if pd.notna(v) else None)
                for t, v in zip(bars["time"], fast_ma.tolist())
            ],
        ),
        NamedSeries(
            name=f"SMA({slow})",
            pane="separate",
            points=[
                EquityPoint(time=t, value=float(v) if pd.notna(v) else None)
                for t, v in zip(bars["time"], slow_ma.tolist())
            ],
        ),
    ]

    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=times,
        extra_series=extras,
    )
