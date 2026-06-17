"""
Static catalog of available backtest strategies.

Adding a new strategy = create the file in `strategies/<id>.py` exposing
`run(ctx, params)`, then add an entry here. The runner picks the right
module by id; nothing else needs to change.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

ParamType = Literal["int", "float"]
Category = Literal["baseline", "trend", "mean_reversion", "systematic", "event", "ai"]


@dataclass
class StrategyParamSpec:
    """Same shape as indicator ParamSpec — drives the dynamic form on
    the frontend."""

    name: str
    type: ParamType
    default: float
    label: str
    min: float | None = None
    max: float | None = None
    step: float | None = None


@dataclass
class StrategyMeta:
    id: str
    name: str
    category: Category
    description: str
    """ 'single' = strategy runs on one ticker; 'multi' would mean a
        portfolio of tickers (Stage B doesn't ship multi yet — reserved
        for future). The frontend uses this to render a single-symbol
        picker vs a watchlist multi-select. """
    universe_type: Literal["single", "multi"] = "single"
    params: list[StrategyParamSpec] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["universeType"] = d.pop("universe_type")
        return d


# ── Catalog ────────────────────────────────────────────────────────────
_REGISTRY: list[StrategyMeta] = [
    StrategyMeta(
        id="buy_hold",
        name="Buy & Hold",
        category="baseline",
        description="Buy at the first bar's open, hold to the end. The benchmark every other strategy must beat.",
        params=[],
    ),
    StrategyMeta(
        id="ma_crossover",
        name="Moving Average Crossover",
        category="trend",
        description="Long when the fast MA is above the slow MA, flat otherwise. Classic trend-follower.",
        params=[
            StrategyParamSpec("fast", "int", 20, "Fast MA period", min=2, max=200),
            StrategyParamSpec("slow", "int", 50, "Slow MA period", min=2, max=400),
        ],
    ),
    StrategyMeta(
        id="rsi_mean_reversion",
        name="RSI Mean Reversion",
        category="mean_reversion",
        description="Buy when RSI is oversold, sell when it returns to neutral. Asymmetric entry/exit.",
        params=[
            StrategyParamSpec("window", "int", 14, "RSI period", min=2, max=100),
            StrategyParamSpec("oversold", "float", 30, "Oversold threshold", min=5, max=50),
            StrategyParamSpec("exit_at", "float", 50, "Exit threshold", min=20, max=80),
        ],
    ),
    StrategyMeta(
        id="dca",
        name="Dollar-Cost Averaging",
        category="systematic",
        description="Buy a fixed dollar amount every N bars regardless of price. Time in the market over timing the market.",
        params=[
            StrategyParamSpec("interval", "int", 21, "Bar interval (≈21 = monthly)", min=1, max=252),
            StrategyParamSpec("amount", "float", 500, "Dollars per buy", min=10, max=100000),
        ],
    ),
    StrategyMeta(
        id="buy_on_dip",
        name="Buy on Dip",
        category="mean_reversion",
        description="Buy after a fixed % pullback from a recent peak, hold for N bars, then sell.",
        params=[
            StrategyParamSpec("drop_pct", "float", 5.0, "Drop threshold (%)", min=0.5, max=50),
            StrategyParamSpec("hold_days", "int", 20, "Hold period (bars)", min=1, max=252),
            StrategyParamSpec("lookback", "int", 20, "Peak lookback (bars)", min=2, max=252),
        ],
    ),
    StrategyMeta(
        id="post_earnings",
        name="Post-Earnings Drift",
        category="event",
        description="Buy N trading days after each earnings release and hold for M days. Optionally limit to reports that beat estimates. US tickers only — yfinance earnings coverage outside the US is sparse.",
        params=[
            StrategyParamSpec("entry_lag_days", "int", 1, "Entry lag (bars after release)", min=0, max=20),
            StrategyParamSpec("hold_days", "int", 20, "Hold period (bars)", min=1, max=252),
            StrategyParamSpec("only_beats", "int", 0, "Only after EPS beats (1=yes, 0=any)", min=0, max=1),
        ],
    ),
    # The DSL strategy is the executor for `/api/ai/backtest/compose` —
    # the LLM produces a rule tree that lands in `params.dsl`. The form
    # has no scalar params on purpose: the whole config is the DSL JSON,
    # so the frontend hides the param form for this id and shows the
    # generated rules instead.
    StrategyMeta(
        id="dsl",
        name="AI Composed Strategy",
        category="ai",
        description="LLM-composed entry/exit rules over indicators + price. Driven by the AI Compose panel; you don't pick this directly.",
        params=[],
    ),
]

_BY_ID: dict[str, StrategyMeta] = {m.id: m for m in _REGISTRY}


def list_strategies() -> list[StrategyMeta]:
    return list(_REGISTRY)


def get_strategy_meta(strategy_id: str) -> StrategyMeta | None:
    return _BY_ID.get(strategy_id)
