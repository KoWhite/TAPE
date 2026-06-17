"""
Static catalog of available indicators.

Each entry is pure metadata — no compute logic. The frontend reads this
list to build pickers + parameter forms; compute.py uses it to validate
inputs and decide pane placement.

Adding a new indicator = append one entry here + one function in
compute.py. No other file needs to change.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

ParamType = Literal["int", "float"]
Pane = Literal["overlay", "separate"]
Category = Literal["trend", "momentum", "volatility", "volume"]


@dataclass
class ParamSpec:
    """Schema for one indicator parameter — drives the dynamic form on
    the frontend. Only int/float are supported for now; bool/enum can
    be added when an indicator actually needs them."""

    name: str
    type: ParamType
    default: float
    label: str
    min: float | None = None
    max: float | None = None
    """ Step is mostly cosmetic — the frontend uses it for the number
        input's `step` attribute. Default 1 for ints, 0.1 for floats. """
    step: float | None = None


@dataclass
class IndicatorMeta:
    """Public metadata for one indicator. Serialized to the frontend
    via /api/indicators."""

    id: str
    name: str
    category: Category
    pane: Pane
    """ Output series names — order matters for frontend rendering and
        legend display. RSI has one ('rsi'), MACD has three. """
    outputs: list[str]
    params: list[ParamSpec] = field(default_factory=list)
    description: str = ""
    """ Optional rendering hints for the chart. Used as-is by the
        frontend pane component. Common keys:
          yMin, yMax       — fix the y-scale (e.g. RSI 0-100)
          refLines         — horizontal lines (e.g. RSI 30 & 70)
          zeroLine: bool   — draw a zero baseline (MACD histogram) """
    chart_hints: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        # Move chart_hints to camelCase for frontend.
        d["chartHints"] = d.pop("chart_hints")
        return d


# ── Catalog ────────────────────────────────────────────────────────────
# Order here = display order in the frontend picker. Group by category
# for readability — categories also drive the picker's section dividers.

_REGISTRY: list[IndicatorMeta] = [
    # ── Trend (overlay on price) ────────────────────────────────────────
    IndicatorMeta(
        id="sma",
        name="Simple Moving Average",
        category="trend",
        pane="overlay",
        outputs=["sma"],
        params=[ParamSpec("window", "int", 20, "Period", min=2, max=400)],
        description="Arithmetic mean of close over the last N bars.",
    ),
    IndicatorMeta(
        id="ema",
        name="Exponential Moving Average",
        category="trend",
        pane="overlay",
        outputs=["ema"],
        params=[ParamSpec("window", "int", 20, "Period", min=2, max=400)],
        description="Smoothed average that weights recent bars more heavily.",
    ),
    IndicatorMeta(
        id="wma",
        name="Weighted Moving Average",
        category="trend",
        pane="overlay",
        outputs=["wma"],
        params=[ParamSpec("window", "int", 20, "Period", min=2, max=400)],
        description="Linearly weighted average — newest bar carries the largest weight.",
    ),
    IndicatorMeta(
        id="bbands",
        name="Bollinger Bands",
        category="trend",
        pane="overlay",
        outputs=["upper", "middle", "lower"],
        params=[
            ParamSpec("window", "int", 20, "Period", min=2, max=200),
            ParamSpec("stddev", "float", 2.0, "Std deviations", min=0.5, max=5.0, step=0.1),
        ],
        description="SMA bracketed by ±N standard deviations — width tracks volatility.",
    ),
    IndicatorMeta(
        id="vwap",
        name="Volume Weighted Average Price",
        category="trend",
        pane="overlay",
        outputs=["vwap"],
        params=[],
        description="Cumulative price × volume / cumulative volume — institutional benchmark.",
    ),

    # ── Momentum (separate pane) ────────────────────────────────────────
    IndicatorMeta(
        id="rsi",
        name="Relative Strength Index",
        category="momentum",
        pane="separate",
        outputs=["rsi"],
        params=[ParamSpec("window", "int", 14, "Period", min=2, max=100)],
        description="0-100 oscillator: >70 overbought, <30 oversold.",
        chart_hints={"yMin": 0, "yMax": 100, "refLines": [30, 70]},
    ),
    IndicatorMeta(
        id="macd",
        name="MACD",
        category="momentum",
        pane="separate",
        outputs=["macd", "signal", "histogram"],
        params=[
            ParamSpec("fast", "int", 12, "Fast", min=2, max=100),
            ParamSpec("slow", "int", 26, "Slow", min=2, max=200),
            ParamSpec("signal", "int", 9, "Signal", min=2, max=100),
        ],
        description="EMA(fast) − EMA(slow), with signal line and histogram.",
        chart_hints={"zeroLine": True},
    ),
    IndicatorMeta(
        id="stoch",
        name="Stochastic Oscillator",
        category="momentum",
        pane="separate",
        outputs=["k", "d"],
        params=[
            ParamSpec("k_period", "int", 14, "%K period", min=2, max=100),
            ParamSpec("d_period", "int", 3, "%D smoothing", min=1, max=50),
        ],
        description="Where price closes within recent high-low range.",
        chart_hints={"yMin": 0, "yMax": 100, "refLines": [20, 80]},
    ),
    IndicatorMeta(
        id="willr",
        name="Williams %R",
        category="momentum",
        pane="separate",
        outputs=["willr"],
        params=[ParamSpec("window", "int", 14, "Period", min=2, max=100)],
        description="Inverted stochastic: 0 to −100, with −20 / −80 as extremes.",
        chart_hints={"yMin": -100, "yMax": 0, "refLines": [-20, -80]},
    ),
    IndicatorMeta(
        id="cci",
        name="Commodity Channel Index",
        category="momentum",
        pane="separate",
        outputs=["cci"],
        params=[ParamSpec("window", "int", 20, "Period", min=2, max=200)],
        description="Deviation of typical price from its SMA, scaled by mean deviation.",
        chart_hints={"refLines": [-100, 100], "zeroLine": True},
    ),
    IndicatorMeta(
        id="roc",
        name="Rate of Change",
        category="momentum",
        pane="separate",
        outputs=["roc"],
        params=[ParamSpec("window", "int", 12, "Period", min=1, max=200)],
        description="Percentage change vs N bars ago.",
        chart_hints={"zeroLine": True},
    ),

    # ── Volatility (separate pane) ──────────────────────────────────────
    IndicatorMeta(
        id="atr",
        name="Average True Range",
        category="volatility",
        pane="separate",
        outputs=["atr"],
        params=[ParamSpec("window", "int", 14, "Period", min=2, max=100)],
        description="Smoothed range — useful for stop-loss sizing.",
    ),
    IndicatorMeta(
        id="stddev",
        name="Standard Deviation",
        category="volatility",
        pane="separate",
        outputs=["stddev"],
        params=[ParamSpec("window", "int", 20, "Period", min=2, max=200)],
        description="Rolling standard deviation of close.",
    ),

    # ── Volume (separate pane) ──────────────────────────────────────────
    IndicatorMeta(
        id="obv",
        name="On-Balance Volume",
        category="volume",
        pane="separate",
        outputs=["obv"],
        params=[],
        description="Cumulative volume signed by price direction — divergence signal.",
    ),
    IndicatorMeta(
        id="mfi",
        name="Money Flow Index",
        category="volume",
        pane="separate",
        outputs=["mfi"],
        params=[ParamSpec("window", "int", 14, "Period", min=2, max=100)],
        description="Volume-weighted RSI: 0-100, with 20 / 80 extremes.",
        chart_hints={"yMin": 0, "yMax": 100, "refLines": [20, 80]},
    ),

    # ── Trend strength ──────────────────────────────────────────────────
    IndicatorMeta(
        id="adx",
        name="Average Directional Index",
        category="trend",
        pane="separate",
        outputs=["adx", "plus_di", "minus_di"],
        params=[ParamSpec("window", "int", 14, "Period", min=2, max=100)],
        description="Trend strength (ADX) plus +DI / −DI direction lines.",
        chart_hints={"yMin": 0, "yMax": 100, "refLines": [25]},
    ),
]

_BY_ID: dict[str, IndicatorMeta] = {m.id: m for m in _REGISTRY}


def list_indicators() -> list[IndicatorMeta]:
    """Return the full catalog in display order."""
    return list(_REGISTRY)


def get_meta(indicator_id: str) -> IndicatorMeta | None:
    """Look up one indicator's metadata by id."""
    return _BY_ID.get(indicator_id)
