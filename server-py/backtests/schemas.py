"""
Backtest request/response contract.

Everything below is intentionally JSON-friendly (no datetime, no Decimal)
so the bridge can serialize via the standard `json` module without a
custom encoder. `time` fields follow the same convention used elsewhere
in Tape: ISO date string ('YYYY-MM-DD') for daily/weekly/monthly bars,
Unix epoch seconds (int) for intraday — both are accepted directly by
lightweight-charts.

**This contract is load-bearing**: Stage C's LLM-generated backtests
will produce results in *this exact shape* so the frontend's result UI
is reused without changes. Adding fields = OK; renaming or removing =
breaks LLM compatibility.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


@dataclass
class EquityPoint:
    """One bar of the equity curve (or drawdown, or any value series)."""

    time: int | str
    value: float


@dataclass
class NamedSeries:
    """Optional auxiliary series — e.g. a strategy can publish its
    indicator readings (RSI values that triggered the signals) so the
    frontend can plot them next to the equity curve.

    Stage C's LLM path will lean on this heavily — anything the model
    wants to chart that isn't equity / drawdown / trades goes here.
    """

    name: str
    """ Where to render: overlay on the equity chart, or its own pane. """
    pane: Literal["overlay", "separate"] = "separate"
    points: list[EquityPoint] = field(default_factory=list)


@dataclass
class Trade:
    """One closed (or still-open) round-trip position."""

    entry_time: int | str
    """ None when the position is still open at backtest end. """
    exit_time: int | str | None
    side: Literal["long", "short"]
    symbol: str
    entry_price: float
    exit_price: float | None
    size: float                 # share count (float to support fractional)
    pnl: float                  # native currency P&L
    pnl_pct: float              # decimal: 0.05 = +5%
    """ Free-form annotation from the strategy — e.g. 'fast/slow MA
        bullish crossover'. Helps debug + audit when a strategy made a
        head-scratching trade. """
    reason: str | None = None


@dataclass
class BacktestStats:
    """Aggregate performance metrics. All percentages are decimals
    (0.15 = +15%, never the literal 15)."""

    total_return: float
    annualized_return: float
    sharpe: float
    sortino: float
    """ Positive number representing the worst peak-to-trough drop;
        e.g. 0.30 means the strategy lost 30% from a previous peak at
        its worst point. """
    max_drawdown: float
    win_rate: float                 # 0..1
    avg_win: float                  # decimal, per winning trade
    avg_loss: float                 # decimal, per losing trade (negative)
    profit_factor: float            # gross profit / gross loss
    num_trades: int
    """ Buy-and-hold baseline return over the same window. The strategy
        beats the market iff total_return > benchmark_return. """
    benchmark_return: float
    """ Excess return vs benchmark (total_return - benchmark_return). """
    alpha: float


@dataclass
class BacktestRequest:
    strategy_id: str
    universe: list[str]             # broker-style codes, e.g. ['US.AAPL']
    start_date: str | None = None   # YYYY-MM-DD (None = all available)
    end_date: str | None = None
    initial_capital: float = 10_000.0
    """ Almost always `dict[str, float]` — the template strategies only
        consume scalar params. The DSL strategy (`strategies/dsl.py`)
        threads its rule tree through here as a nested object, hence
        the wider type. """
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class BacktestResult:
    strategy_id: str
    params: dict[str, float]
    universe: list[str]
    start_date: str
    end_date: str
    initial_capital: float
    final_equity: float

    equity_curve: list[EquityPoint] = field(default_factory=list)
    benchmark_curve: list[EquityPoint] = field(default_factory=list)
    drawdown_curve: list[EquityPoint] = field(default_factory=list)
    extra_series: list[NamedSeries] = field(default_factory=list)

    trades: list[Trade] = field(default_factory=list)
    stats: BacktestStats | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Serialize to camelCase JSON for the frontend.

        Manual mapping (not asdict) so dataclass field names can stay
        snake_case while the API stays camelCase — same convention used
        by indicators/schemas.py.
        """
        return {
            "strategyId": self.strategy_id,
            "params": self.params,
            "universe": self.universe,
            "startDate": self.start_date,
            "endDate": self.end_date,
            "initialCapital": self.initial_capital,
            "finalEquity": self.final_equity,
            "equityCurve": [asdict(p) for p in self.equity_curve],
            "benchmarkCurve": [asdict(p) for p in self.benchmark_curve],
            "drawdownCurve": [asdict(p) for p in self.drawdown_curve],
            "extraSeries": [
                {
                    "name": s.name,
                    "pane": s.pane,
                    "points": [asdict(p) for p in s.points],
                }
                for s in self.extra_series
            ],
            "trades": [
                {
                    "entryTime": t.entry_time,
                    "exitTime": t.exit_time,
                    "side": t.side,
                    "symbol": t.symbol,
                    "entryPrice": t.entry_price,
                    "exitPrice": t.exit_price,
                    "size": t.size,
                    "pnl": t.pnl,
                    "pnlPct": t.pnl_pct,
                    "reason": t.reason,
                }
                for t in self.trades
            ],
            "stats": (
                {
                    "totalReturn": self.stats.total_return,
                    "annualizedReturn": self.stats.annualized_return,
                    "sharpe": self.stats.sharpe,
                    "sortino": self.stats.sortino,
                    "maxDrawdown": self.stats.max_drawdown,
                    "winRate": self.stats.win_rate,
                    "avgWin": self.stats.avg_win,
                    "avgLoss": self.stats.avg_loss,
                    "profitFactor": self.stats.profit_factor,
                    "numTrades": self.stats.num_trades,
                    "benchmarkReturn": self.stats.benchmark_return,
                    "alpha": self.stats.alpha,
                }
                if self.stats
                else None
            ),
            "meta": self.meta,
        }
