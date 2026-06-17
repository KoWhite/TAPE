"""
RSI mean reversion — buy oversold, sell when neutral.

  Long when RSI(14) < 30 (oversold).
  Flat when RSI(14) > 50 (back to neutral — sell into recovery).

The "exit at 50, not at 70" choice is intentional: waiting for 70 (full
overbought) bleeds gains during sideways chop. Most academic studies
favor the asymmetric 30/50 rule.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ..engine import simulate_long_only
from ..schemas import EquityPoint, NamedSeries
from .base import StrategyContext, StrategyOutput


def _rsi(close: pd.Series, window: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    # Wilder smoothing — same as indicators/compute.py for consistency.
    avg_gain = gain.ewm(alpha=1.0 / window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / window, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.where(avg_loss > 0, 100)


def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    window = int(params.get("window", 14))
    oversold = float(params.get("oversold", 30))
    exit_at = float(params.get("exit_at", 50))

    bars = ctx.bars
    close = bars["close"].astype(float)
    rsi = _rsi(close, window)

    # Stateful position: enter when oversold, exit when crossing exit_at.
    pos: list[float] = []
    in_pos = False
    reasons: dict[int, str] = {}
    for i, v in enumerate(rsi.tolist()):
        if pd.isna(v):
            pos.append(0.0)
            continue
        if not in_pos and v < oversold:
            in_pos = True
            reasons[i] = f"RSI {v:.1f} < {oversold:.0f} oversold"
        elif in_pos and v > exit_at:
            in_pos = False
            reasons[i] = f"RSI {v:.1f} > {exit_at:.0f} exit zone"
        pos.append(1.0 if in_pos else 0.0)
    position = pd.Series(pos)

    trades, equity, times = simulate_long_only(
        bars, position, ctx.initial_capital, ctx.symbol, reason_for=reasons,
    )

    extras = [
        NamedSeries(
            name=f"RSI({window})",
            pane="separate",
            points=[
                EquityPoint(time=t, value=float(v) if pd.notna(v) else None)
                for t, v in zip(bars["time"], rsi.tolist())
            ],
        ),
    ]

    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=times,
        extra_series=extras,
    )
