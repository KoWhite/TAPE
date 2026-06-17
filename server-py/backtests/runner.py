"""
Top-level orchestrator: takes a `BacktestRequest`, dispatches to the
right strategy, runs it, and stitches the result with benchmark + stats
into a `BacktestResult`.

This is the only file in the package that knows about both data fetching
(via data.fetch_bars_yf) and strategies. Everything else stays pure.
"""
from __future__ import annotations

import importlib
import time

import pandas as pd

from .engine import benchmark_buy_hold
from .registry import get_strategy_meta
from .schemas import (
    BacktestRequest,
    BacktestResult,
    EquityPoint,
)
from .stats import compute_stats, drawdown_series
from .strategies.base import StrategyContext


def _yf_symbol_from_code(code: str) -> str:
    """US.AAPL → AAPL. Mirrors the yfinance mapping used by indicators."""
    if not code or "." not in code:
        return code
    parts = code.split(".", 1)
    if parts[0] == "US":
        return parts[1].lstrip(".")
    if parts[1] == "US":
        return parts[0].lstrip(".")
    return parts[1]


def _filter_by_date(bars: pd.DataFrame, start: str | None, end: str | None) -> pd.DataFrame:
    """Slice bars to the requested calendar window. ISO date strings
    only — intraday windowing isn't supported in Stage B."""
    if not start and not end:
        return bars
    times = bars["time"].astype(str)
    mask = pd.Series([True] * len(bars))
    if start:
        mask &= times >= start
    if end:
        mask &= times <= end
    return bars[mask].reset_index(drop=True)


def run(req: BacktestRequest, fetch_bars) -> BacktestResult:
    """Execute one backtest end-to-end.

    `fetch_bars` is injected so the runner stays decoupled from the
    bridge — easier to swap data sources / unit-test with synthetic
    bars later. The bridge passes in `data.fetch_bars_yf`.
    """
    started = time.time()

    meta = get_strategy_meta(req.strategy_id)
    if meta is None:
        raise ValueError(f"Unknown strategy: {req.strategy_id!r}")

    if not req.universe:
        raise ValueError("universe must contain at least one code")

    # Stage B is single-symbol — multi-asset portfolios are deferred.
    code = req.universe[0]

    # Pull a generous window so the strategy has warm-up bars even when
    # the user picked a tight start_date.
    raw_bars_list = fetch_bars(code, "K_DAY", 1500)
    if not raw_bars_list:
        raise RuntimeError(f"no bars available for {code}")

    bars = pd.DataFrame(raw_bars_list)
    bars_window = _filter_by_date(bars, req.start_date, req.end_date)
    if len(bars_window) < 2:
        raise RuntimeError(
            f"not enough bars in window {req.start_date}..{req.end_date} for {code}"
        )

    # Strategy modules live in backtests.strategies.<id> — import lazily
    # so we don't pay the cost of all 5 at startup.
    module = importlib.import_module(f".strategies.{req.strategy_id}", __package__)

    ctx = StrategyContext(
        bars=bars_window.reset_index(drop=True),
        initial_capital=req.initial_capital,
        symbol=_yf_symbol_from_code(code),
    )
    output = module.run(ctx, dict(req.params))

    # Benchmark = Buy & Hold over the same window with the same capital.
    bench = benchmark_buy_hold(ctx.bars, req.initial_capital)

    # Stats need aligned (equity, times, benchmark).
    stats = compute_stats(
        equity=output.equity_curve,
        times=output.equity_times,
        trades=output.trades,
        benchmark_equity=bench,
    )

    # Drawdown curve (negative decimals, peak = 0).
    dd_pairs = drawdown_series(output.equity_curve, output.equity_times)
    dd_curve = [EquityPoint(time=t, value=v) for t, v in dd_pairs]

    equity_pts = [
        EquityPoint(time=t, value=v)
        for t, v in zip(output.equity_times, output.equity_curve)
    ]
    bench_pts = [
        EquityPoint(time=t, value=v)
        for t, v in zip(output.equity_times, bench)
    ]

    final_equity = output.equity_curve[-1] if output.equity_curve else req.initial_capital
    elapsed_ms = int((time.time() - started) * 1000)

    return BacktestResult(
        strategy_id=req.strategy_id,
        params=dict(req.params),
        universe=list(req.universe),
        start_date=str(ctx.bars["time"].iloc[0]),
        end_date=str(ctx.bars["time"].iloc[-1]),
        initial_capital=req.initial_capital,
        final_equity=final_equity,
        equity_curve=equity_pts,
        benchmark_curve=bench_pts,
        drawdown_curve=dd_curve,
        extra_series=output.extra_series,
        trades=output.trades,
        stats=stats,
        meta={
            "backend": "pandas",
            "elapsedMs": elapsed_ms,
            "barsAnalyzed": len(ctx.bars),
        },
    )
