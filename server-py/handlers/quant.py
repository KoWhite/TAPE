"""Indicators + backtests — the quant pipeline.

`indicator/compute` and `backtest/run` both pull bars via fetch_bars_smart
(Futu first, yfinance fallback). Indicator results are cached for 5 min;
backtest results aren't — they're cheap to recompute and tend to be
parameter-swept anyway.
"""
from __future__ import annotations

import json

import pandas as pd

from ai import compile_filters, run_screen
from backtests import BacktestRequest, list_strategies, run as run_backtest
from db import cache_get, cache_set
from futu_bridge import fetch_bars_smart
from indicators import compute as compute_indicator, list_indicators

from router import JsonResponse, Payload, Router, bad_request, not_found, ok


router = Router()


@router.get("/api/indicators")
def indicators_catalog(_payload: Payload) -> JsonResponse:
    return ok({"indicators": [m.to_dict() for m in list_indicators()]})


@router.post("/api/indicator/compute")
def indicator_compute(payload: Payload) -> JsonResponse:
    code = payload.get("code")
    indicator_id = payload.get("indicator")
    if not code or not indicator_id:
        return bad_request("code (string) and indicator (string) required")
    ktype = payload.get("ktype") or "K_DAY"
    count = int(payload.get("count") or 250)
    params = payload.get("params") or {}
    # Cache key includes params (sorted JSON) so different parameter
    # combinations don't collide. TTL mirrors the bars TTL since bars
    # are the only thing that changes.
    params_key = json.dumps(params, sort_keys=True, default=str)
    cache_key = f"indicator:{indicator_id}:{code}:{ktype}:{count}:{params_key}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return ok(cached)
    bars = fetch_bars_smart(code, ktype, count)
    if not bars:
        return not_found(f"no bars available for {code} {ktype}")
    df = pd.DataFrame(bars)
    result = compute_indicator(indicator_id, df, params)
    result_dict = result.to_dict()
    # 5min TTL — same intuition as intraday bars: short enough that the
    # latest bar's contribution refreshes quickly.
    cache_set(cache_key, result_dict, ttl_s=5 * 60)
    return ok(result_dict)


@router.get("/api/backtests")
def backtests_catalog(_payload: Payload) -> JsonResponse:
    return ok({"strategies": [m.to_dict() for m in list_strategies()]})


@router.post("/api/backtest/run")
def backtest_run(payload: Payload) -> JsonResponse:
    strategy_id = payload.get("strategyId") or payload.get("strategy_id")
    universe = payload.get("universe") or []
    if not strategy_id or not isinstance(strategy_id, str):
        return bad_request("strategyId (string) required")
    if not isinstance(universe, list) or not universe:
        return bad_request("universe (string[]) required")
    # Most params are scalars (cast to float so the strategy modules can
    # rely on numeric types), but the `dsl` strategy threads its rule
    # tree through params.dsl as a nested object — keep dict/list values
    # verbatim.
    raw_params = payload.get("params") or {}
    coerced: dict = {}
    for k, v in raw_params.items():
        if isinstance(v, (dict, list)):
            coerced[k] = v
        else:
            coerced[k] = float(v)
    req = BacktestRequest(
        strategy_id=strategy_id,
        universe=[str(c) for c in universe],
        start_date=payload.get("startDate") or payload.get("start_date"),
        end_date=payload.get("endDate") or payload.get("end_date"),
        initial_capital=float(
            payload.get("initialCapital")
            or payload.get("initial_capital")
            or 10000.0
        ),
        params=coerced,
    )
    result = run_backtest(req, fetch_bars_smart)
    return ok(result.to_dict())


@router.post("/api/screener/compile")
def screener_compile(payload: Payload) -> JsonResponse:
    """NL prompt → compiled filter set. Pure LLM step — no bars fetched."""
    return ok(compile_filters(payload))


@router.post("/api/screener/run")
def screener_run(payload: Payload) -> JsonResponse:
    """Evaluate filters against a universe. Caps at 80 tickers to keep
    latency bounded; oversize universes are silently truncated."""
    return ok(run_screen(payload, fetch_bars_smart))
