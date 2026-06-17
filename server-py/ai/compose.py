"""
AI natural-language backtesting — natural language → DSL rule tree.

Unlike `suggest`, the model is *not* limited to a fixed set of templates;
it composes an entry/exit rule tree that the `dsl` strategy can execute
without us shipping arbitrary code execution.

The contract with the model is the JSON schema described in
`backtests/strategies/dsl.py`. We pin it inline here so the prompt is
self-contained — and we validate the model's output against that file's
validator before handing it back, so a malformed DSL fails before the
frontend tries to run it.
"""
from __future__ import annotations

import json
from typing import Any

from backtests.strategies.dsl import validate_dsl
from indicators import list_indicators
from .json_response import request_json_object


def _indicator_catalog_for_prompt() -> list[dict]:
    out: list[dict] = []
    for meta in list_indicators():
        out.append({
            "id": meta.id,
            "outputs": meta.outputs,
            "params": [
                {
                    "name": p.name,
                    "type": p.type,
                    "default": p.default,
                    "min": p.min,
                    "max": p.max,
                }
                for p in meta.params
            ],
        })
    return out


def _fallback_dsl() -> dict:
    return {
        "name": "EMA crossover fallback",
        "entry": {
            "left": {
                "indicator": "ema",
                "params": {"window": 20},
                "output": "ema",
            },
            "op": "cross_above",
            "right": {
                "indicator": "ema",
                "params": {"window": 50},
                "output": "ema",
            },
        },
        "exit": {
            "left": {
                "indicator": "ema",
                "params": {"window": 20},
                "output": "ema",
            },
            "op": "cross_below",
            "right": {
                "indicator": "ema",
                "params": {"window": 50},
                "output": "ema",
            },
        },
        "indicators_to_chart": [
            {"indicator": "ema", "params": {"window": 20}, "output": "ema"},
            {"indicator": "ema", "params": {"window": 50}, "output": "ema"},
        ],
    }


SYSTEM_PROMPT_TEMPLATE = (
    "You are a quantitative strategy DSL assistant. Translate the user's natural-language strategy into JSON.\n"
    "**Return only JSON. Do not include explanations or markdown.**\n\n"
    "Schema (pseudo BNF):\n"
    "```\n"
    "Result := {\n"
    '  "name":   string,                       // short strategy name in 简体中文, <= 30 chars\n'
    '  "rationale": string,                    // rationale in 简体中文, 1-2 short sentences\n'
    '  "entry":  Condition,\n'
    '  "exit":   Condition,\n'
    '  "indicators_to_chart": [Operand]?       // optional, rendered on the chart\n'
    "}\n"
    "Condition :=\n"
    '  { "all": [Condition, ...] }\n'
    '  | { "any": [Condition, ...] }\n'
    '  | { "left": Operand, "op": Op, "right": Operand }\n'
    'Op := "<" | "<=" | ">" | ">=" | "==" | "!=" | "cross_above" | "cross_below"\n'
    "Operand :=\n"
    "  number\n"
    '  | "open" | "high" | "low" | "close" | "volume"\n'
    '  | { "indicator": IndicatorId, "params": Object, "output": OutputName }\n'
    "```\n\n"
    "Hard constraints:\n"
    "1. Use only indicator ids from the indicator catalog. Parameter names/ranges must match exactly. "
    "The output must be one of that indicator's outputs.\n"
    "2. Both sides of a comparison must resolve to numeric series or numeric values.\n"
    "3. cross_above/cross_below mean crossing from below/above and are suitable for crossover signals.\n"
    "4. Do not encode position sizing, stop loss, or take profit logic. The engine handles execution; describe entry and exit only.\n"
    "5. Use long-only logic. Short selling is not supported.\n"
    "6. Keep indicator parameters consistent between entry and exit when they refer to the same signal.\n"
    "7. Language: `name` and `rationale` must be written in Simplified Chinese (简体中文). "
    "Schema keys, indicator ids, output names, and operator symbols stay in English exactly as specified. "
    "Indicator abbreviations like RSI / MACD / SMA may appear in the prose as-is.\n\n"
    "Indicator catalog:\n```json\n__INDICATORS_JSON__\n```\n\n"
    "Example: 'Buy when RSI(14) crosses below 30, sell when it moves back above 50' ->\n"
    "```json\n"
    "{\n"
    '  "name": "RSI 14 超卖均值回归",\n'
    '  "rationale": "经典的超卖均值回归思路,RSI 跌破 30 时入场,回到中性区域 50 上方时出场。",\n'
    '  "entry": { "left": { "indicator": "rsi", "params": { "window": 14 }, "output": "rsi" }, "op": "<", "right": 30 },\n'
    '  "exit":  { "left": { "indicator": "rsi", "params": { "window": 14 }, "output": "rsi" }, "op": ">", "right": 50 },\n'
    '  "indicators_to_chart": [{ "indicator": "rsi", "params": { "window": 14 }, "output": "rsi" }]\n'
    "}\n"
    "```"
)


def compose_backtest(payload: dict) -> dict:
    """
    payload (camelCase):
        {
            "prompt":         "<natural-language strategy>",       // required
            "symbol":         "US.AAPL",                  // optional
            "startDate":      "...",                       // optional
            "endDate":        "...",                       // optional
            "initialCapital": 10000,                       // optional
            "model":          "deepseek-v4-pro"            // optional (pro is the default for compose)
        }

    Returns:
        {
            "dsl":      <DSL>,
            "rationale":str,
            "request":  <BacktestRequest>,    // strategyId='dsl', params.dsl=<DSL>
            "model":    str,
            "provider": str
        }
    """
    user_prompt = (payload.get("prompt") or "").strip()
    if not user_prompt:
        raise ValueError("prompt (string) required")

    indicators_json = json.dumps(_indicator_catalog_for_prompt(), ensure_ascii=False)
    system_msg = SYSTEM_PROMPT_TEMPLATE.replace("__INDICATORS_JSON__", indicators_json)

    chat_payload: dict[str, Any] = {
        # Compose benefits from a stronger model than flash; let the
        # caller override but default to pro.
        "model": payload.get("model") or "deepseek-v4-pro",
        "temperature": 0.2,
        "maxTokens": 1200,
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
            **_fallback_dsl(),
            "rationale": (
                "AI did not return valid JSON, so Tape fell back to a conservative "
                "EMA crossover DSL."
            ),
        }
        res = {"model": None, "provider": None, "usage": None}
        fallback_reason = str(e)

    dsl = {
        "name": parsed.get("name") or "AI Composed",
        "entry": parsed.get("entry"),
        "exit": parsed.get("exit"),
    }
    if parsed.get("indicators_to_chart") is not None:
        dsl["indicators_to_chart"] = parsed["indicators_to_chart"]

    # Validate before returning — surfaces "indicator X has no output Y"
    # type errors at compose time, not at run time.
    validate_dsl(dsl)

    rationale = str(parsed.get("rationale") or "").strip()
    if fallback_reason:
        rationale = f"{rationale} Original parse error: {fallback_reason}"
    request = {
        "strategyId": "dsl",
        "universe": [payload.get("symbol") or "US.AAPL"],
        "startDate": payload.get("startDate"),
        "endDate": payload.get("endDate"),
        "initialCapital": payload.get("initialCapital") or 10000,
        "params": {"dsl": dsl},
    }

    return {
        "dsl": dsl,
        "rationale": rationale,
        "request": request,
        "model": res.get("model"),
        "provider": res.get("provider"),
        "usage": res.get("usage"),
    }
