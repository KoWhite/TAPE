"""
Backtests subpackage — Stage B of the quant roadmap.

Layout (per project convention — see memory: feedback_modular_files):

  schemas.py     — Trade / Stats / BacktestResult dataclasses. The
                   serialized JSON is the *contract* — Stage C's LLM
                   path will produce results in this same shape so the
                   frontend renders a single result UI for both paths.

  stats.py       — Pure-pandas computation of Sharpe / Sortino /
                   Max Drawdown / win rate from an equity curve and
                   trade list. No I/O, easy to unit-test.

  engine.py      — Bar-by-bar simulators that turn strategy signals
                   into Trade lists + equity curves. Long-only and
                   DCA flavors today; shorts can be added later.

  registry.py    — Static catalog of available strategies (id, name,
                   params schema). Frontend reads this for the picker.

  strategies/    — One file per strategy. Each exposes a `run(bars,
                   params, ctx)` returning a StrategyOutput.

Public API used by the bridge:
  list_strategies()              -> list[StrategyMeta]
  get_strategy_meta(id)          -> StrategyMeta | None
  run(req: BacktestRequest)      -> BacktestResult
"""
from __future__ import annotations

from .registry import (
    StrategyMeta,
    StrategyParamSpec,
    list_strategies,
    get_strategy_meta,
)
from .schemas import (
    BacktestRequest,
    BacktestResult,
    BacktestStats,
    EquityPoint,
    NamedSeries,
    Trade,
)
from .runner import run

__all__ = [
    "StrategyMeta",
    "StrategyParamSpec",
    "BacktestRequest",
    "BacktestResult",
    "BacktestStats",
    "EquityPoint",
    "NamedSeries",
    "Trade",
    "list_strategies",
    "get_strategy_meta",
    "run",
]
