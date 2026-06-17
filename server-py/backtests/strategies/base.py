"""
Shared shapes used by every strategy.

A strategy's `run()` returns a `StrategyOutput` — the runner stitches
that together with stats + benchmark to build the final BacktestResult.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from ..schemas import NamedSeries, Trade


@dataclass
class StrategyOutput:
    """What every strategy hands back to the runner.

    `equity_curve` and `equity_times` are produced by an engine
    simulator (or hand-built for special strategies). The runner
    derives drawdown + stats from these.
    """

    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[float] = field(default_factory=list)
    equity_times: list = field(default_factory=list)
    """ Optional indicator/diagnostic series the strategy wants the UI
        to plot alongside the equity curve — e.g. the RSI values that
        triggered the signals. """
    extra_series: list[NamedSeries] = field(default_factory=list)


@dataclass
class StrategyContext:
    """Common config the runner injects into every strategy."""

    bars: pd.DataFrame  # OHLCV with 'time' column
    initial_capital: float
    symbol: str         # primary symbol, for trade attribution
