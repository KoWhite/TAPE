"""
AI strategy suggestion — natural language → existing template strategy.

The model is restricted to the registry's non-DSL strategies and must
return one of their ids plus param values within the registry's bounds.
The frontend pipes this straight into the BacktestParamForm so users
see + can edit the choice before running.
"""
from __future__ import annotations

import json
from typing import Any

from backtests.registry import get_strategy_meta, list_strategies
from .json_response import request_json_object


def _registry_for_prompt() -> list[dict]:
    """A pruned view of the strategy catalog the model can pick from.

    Excludes the `dsl` strategy on purpose — that one is for compose,
    not suggest. Including it would tempt the model to bypass the
    template path even when a template fits.
    """
    out: list[dict] = []
    for meta in list_strategies():
        if meta.id == "dsl":
            continue
        out.append({
            "id": meta.id,
            "name": meta.name,
            "category": meta.category,
            "description": meta.description,
            "params": [
                {
                    "name": p.name,
                    "type": p.type,
                    "label": p.label,
                    "default": p.default,
                    "min": p.min,
                    "max": p.max,
                }
                for p in meta.params
            ],
        })
    return out


SYSTEM_PROMPT_TEMPLATE = (
    "You are a quantitative strategy advisor. The user will describe a backtest goal in natural language. "
    "Your task is to choose the best fit from the template strategy registry below and recommend parameters.\n\n"
    "Hard requirements:\n"
    "1. Return only a JSON object with this shape:\n"
    "   {\n"
    '     "strategyId": "<must be an id from the template strategy registry>",\n'
    '     "params": { "paramName": number, "...": number },\n'
    '     "rationale": "<rationale in Simplified Chinese, 1-2 short sentences>"\n'
    "   }\n"
    "2. Parameter names must exactly match that strategy's params[].name. Values must stay within min/max. "
    "You may omit parameters when the default is appropriate.\n"
    "3. Do not invent new strategy ids. Do not return dsl. Do not include markdown or text outside the JSON.\n"
    "4. Language: `rationale` must be written in Simplified Chinese (简体中文). "
    "Schema keys, `strategyId`, and parameter names stay in English exactly as the registry defines them.\n\n"
    "Template strategy registry:\n```json\n__REGISTRY_JSON__\n```"
)


def _coerce_number(value: Any, *, integer: bool) -> float | int:
    if isinstance(value, bool):
        raise ValueError("boolean is not a valid param value")
    if not isinstance(value, (int, float)):
        raise ValueError(f"expected number, got {type(value).__name__}")
    return int(value) if integer else float(value)


def _validate_against_meta(strategy_id: str, params: dict) -> dict:
    meta = get_strategy_meta(strategy_id)
    if meta is None or meta.id == "dsl":
        raise ValueError(f"model returned unsupported strategyId: {strategy_id!r}")
    out: dict[str, float | int] = {}
    by_name = {p.name: p for p in meta.params}
    for name, value in params.items():
        spec = by_name.get(name)
        if spec is None:
            # Silently drop hallucinated params instead of failing —
            # most of the time it's a stray key like "symbol".
            continue
        try:
            num = _coerce_number(value, integer=spec.type == "int")
        except ValueError as e:
            raise ValueError(f"params.{name}: {e}") from e
        if spec.min is not None and num < spec.min:
            num = spec.min if spec.type == "float" else int(spec.min)
        if spec.max is not None and num > spec.max:
            num = spec.max if spec.type == "float" else int(spec.max)
        out[name] = num
    # Backfill missing required params with defaults so the run is valid.
    for spec in meta.params:
        if spec.name not in out:
            out[spec.name] = (
                int(spec.default) if spec.type == "int" else float(spec.default)
            )
    return out


def suggest_backtest(payload: dict) -> dict:
    """
    payload (camelCase):
        {
            "prompt":         "I want a trend-following backtest",  // required
            "symbol":         "US.AAPL",                    // optional
            "startDate":      "2023-01-01",                 // optional
            "endDate":        "2025-01-01",                 // optional
            "initialCapital": 10000,                        // optional
            "model":          "deepseek-v4-flash"           // optional
        }

    Returns:
        {
            "strategyId": str,
            "params":    dict,
            "rationale": str,
            "request":   <BacktestRequest>,   // ready to POST to /api/backtest/run
            "model":     str,
            "provider":  str
        }
    """
    user_prompt = (payload.get("prompt") or "").strip()
    if not user_prompt:
        raise ValueError("prompt (string) required")

    registry_json = json.dumps(_registry_for_prompt(), ensure_ascii=False, indent=2)
    system_msg = SYSTEM_PROMPT_TEMPLATE.replace("__REGISTRY_JSON__", registry_json)

    chat_payload: dict[str, Any] = {
        "model": payload.get("model"),
        "temperature": 0.2,
        "maxTokens": 600,
        "json": True,
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_prompt},
        ],
    }
    fallback_reason = ""
    try:
        parsed, res = request_json_object(chat_payload)
    except RuntimeError as e:
        parsed = {
            "strategyId": "ma_crossover",
            "params": {"fast": 20, "slow": 50},
            "rationale": (
                "AI did not return valid JSON, so Tape fell back to a conservative "
                "moving-average crossover template."
            ),
        }
        res = {"model": None, "provider": None, "usage": None}
        fallback_reason = str(e)

    strategy_id = parsed.get("strategyId") or parsed.get("strategy_id")
    if not isinstance(strategy_id, str):
        raise RuntimeError("AI response is missing strategyId")

    raw_params = parsed.get("params") or {}
    if not isinstance(raw_params, dict):
        raise RuntimeError("AI response params must be an object")

    params = _validate_against_meta(strategy_id, raw_params)
    rationale = str(parsed.get("rationale") or "").strip()
    if fallback_reason:
        rationale = f"{rationale} Original parse error: {fallback_reason}"

    # Build a ready-to-submit BacktestRequest payload (camelCase).
    request = {
        "strategyId": strategy_id,
        "universe": [payload.get("symbol") or "US.AAPL"],
        "startDate": payload.get("startDate"),
        "endDate": payload.get("endDate"),
        "initialCapital": payload.get("initialCapital") or 10000,
        "params": params,
    }

    return {
        "strategyId": strategy_id,
        "params": params,
        "rationale": rationale,
        "request": request,
        "model": res.get("model"),
        "provider": res.get("provider"),
        "usage": res.get("usage"),
    }
