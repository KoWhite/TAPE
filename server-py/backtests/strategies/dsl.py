"""
Rule-based DSL strategy — long-only, entry/exit conditions described as
JSON.

Why this exists: stage C of the quant roadmap (LLM natural-language
backtests) needs an executor that the model can target without writing
arbitrary Python. The model emits a small JSON tree; this file evaluates
it on top of the existing indicator library and the long-only simulator.

DSL shape (validated at runtime — see `_validate_condition`):

    {
        "name": "RSI 14 oversold + EMA 50 trend filter",
        "entry": <Condition>,
        "exit":  <Condition>,
        "indicators_to_chart": [<IndicatorRef>]   // optional
    }

    Condition :=
        { "all": [Condition, ...] }
      | { "any": [Condition, ...] }
      | { "left": Operand, "op": <Op>, "right": Operand }

    Op := "<" | "<=" | ">" | ">=" | "==" | "!="
        | "cross_above" | "cross_below"

    Operand :=
        number                                   // constant
      | "open" | "high" | "low" | "close" | "volume"
      | { "indicator": "<id>", "params": {...}, "output": "<output_name>" }

The runner injects `params={"dsl": <DSL dict>}` into this strategy.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from indicators import compute_series, get_meta as get_indicator_meta

from ..engine import simulate_long_only
from ..schemas import EquityPoint, NamedSeries
from .base import StrategyContext, StrategyOutput

PRICE_FIELDS = {"open", "high", "low", "close", "volume"}
COMPARE_OPS = {"<", "<=", ">", ">=", "==", "!="}
CROSS_OPS = {"cross_above", "cross_below"}
ALL_OPS = COMPARE_OPS | CROSS_OPS


# ── Validation ─────────────────────────────────────────────────────────
def _validate_operand(op: Any, path: str) -> None:
    if isinstance(op, (int, float)) and not isinstance(op, bool):
        return
    if isinstance(op, str):
        if op not in PRICE_FIELDS:
            raise ValueError(
                f"{path}: unknown price field {op!r} (use one of {sorted(PRICE_FIELDS)})"
            )
        return
    if isinstance(op, dict) and "indicator" in op:
        ind_id = op.get("indicator")
        if not isinstance(ind_id, str):
            raise ValueError(f"{path}.indicator must be a string id")
        meta = get_indicator_meta(ind_id)
        if meta is None:
            raise ValueError(f"{path}: unknown indicator {ind_id!r}")
        output = op.get("output")
        if output is not None and output not in meta.outputs:
            raise ValueError(
                f"{path}: indicator {ind_id} has no output {output!r}; "
                f"available: {meta.outputs}"
            )
        params = op.get("params")
        if params is not None and not isinstance(params, dict):
            raise ValueError(f"{path}.params must be an object")
        return
    raise ValueError(
        f"{path}: invalid operand — must be a number, price field name, "
        f"or {{indicator, params, output}}"
    )


def _validate_condition(cond: Any, path: str) -> None:
    if not isinstance(cond, dict):
        raise ValueError(f"{path}: condition must be an object")
    if "all" in cond or "any" in cond:
        key = "all" if "all" in cond else "any"
        children = cond[key]
        if not isinstance(children, list) or not children:
            raise ValueError(f"{path}.{key}: non-empty array of conditions required")
        for i, child in enumerate(children):
            _validate_condition(child, f"{path}.{key}[{i}]")
        return
    op = cond.get("op")
    if op not in ALL_OPS:
        raise ValueError(
            f"{path}.op: must be one of {sorted(ALL_OPS)} (got {op!r})"
        )
    if "left" not in cond or "right" not in cond:
        raise ValueError(f"{path}: comparison condition requires 'left' and 'right'")
    _validate_operand(cond["left"], f"{path}.left")
    _validate_operand(cond["right"], f"{path}.right")


def validate_dsl(dsl: Any) -> None:
    """Raise ValueError with a path-prefixed message when the DSL is
    malformed. Used by the LLM `compose` endpoint *and* the runner."""
    if not isinstance(dsl, dict):
        raise ValueError("dsl: must be an object")
    if "entry" not in dsl or "exit" not in dsl:
        raise ValueError("dsl: 'entry' and 'exit' conditions are required")
    _validate_condition(dsl["entry"], "dsl.entry")
    _validate_condition(dsl["exit"], "dsl.exit")
    extras = dsl.get("indicators_to_chart")
    if extras is not None:
        if not isinstance(extras, list):
            raise ValueError("dsl.indicators_to_chart: must be an array")
        for i, ref in enumerate(extras):
            _validate_operand(ref, f"dsl.indicators_to_chart[{i}]")


# ── Evaluation ─────────────────────────────────────────────────────────
def _series_from_indicator(ref: dict, bars: pd.DataFrame) -> pd.Series:
    ind_id = ref["indicator"]
    params = ref.get("params") or {}
    meta = get_indicator_meta(ind_id)
    output = ref.get("output") or (meta.outputs[0] if meta else ind_id)
    series_map = compute_series(ind_id, bars, params)
    if output not in series_map:
        raise ValueError(f"indicator {ind_id} produced no series {output!r}")
    s = series_map[output]
    return s.reset_index(drop=True)


def _eval_operand(op: Any, bars: pd.DataFrame) -> pd.Series:
    if isinstance(op, (int, float)) and not isinstance(op, bool):
        return pd.Series([float(op)] * len(bars))
    if isinstance(op, str):
        return bars[op].astype(float).reset_index(drop=True)
    return _series_from_indicator(op, bars)


def _eval_condition(cond: dict, bars: pd.DataFrame) -> pd.Series:
    if "all" in cond:
        subs = [_eval_condition(c, bars) for c in cond["all"]]
        out = subs[0].fillna(False).astype(bool)
        for s in subs[1:]:
            out = out & s.fillna(False).astype(bool)
        return out
    if "any" in cond:
        subs = [_eval_condition(c, bars) for c in cond["any"]]
        out = subs[0].fillna(False).astype(bool)
        for s in subs[1:]:
            out = out | s.fillna(False).astype(bool)
        return out

    op = cond["op"]
    left = _eval_operand(cond["left"], bars)
    right = _eval_operand(cond["right"], bars)
    if op == "<":
        return (left < right).fillna(False)
    if op == "<=":
        return (left <= right).fillna(False)
    if op == ">":
        return (left > right).fillna(False)
    if op == ">=":
        return (left >= right).fillna(False)
    if op == "==":
        return (left == right).fillna(False)
    if op == "!=":
        return (left != right).fillna(False)
    if op == "cross_above":
        return ((left.shift(1) <= right.shift(1)) & (left > right)).fillna(False)
    if op == "cross_below":
        return ((left.shift(1) >= right.shift(1)) & (left < right)).fillna(False)
    raise ValueError(f"unknown op: {op}")


def _ref_label(ref: Any) -> str:
    if isinstance(ref, dict):
        ind = ref.get("indicator", "?")
        params = ref.get("params") or {}
        if params:
            inner = ",".join(f"{k}={v}" for k, v in params.items())
            return f"{ind}({inner})"
        return ind
    return str(ref)


# ── Strategy entrypoint ────────────────────────────────────────────────
def run(ctx: StrategyContext, params: dict) -> StrategyOutput:
    dsl = params.get("dsl") if isinstance(params, dict) else None
    if not isinstance(dsl, dict):
        raise ValueError("dsl strategy requires params.dsl (object)")
    validate_dsl(dsl)

    bars = ctx.bars
    entry = _eval_condition(dsl["entry"], bars)
    exit_ = _eval_condition(dsl["exit"], bars)

    # State machine: enter when entry fires, exit when exit fires (entry
    # has priority on the same bar — the model can disambiguate via the
    # exit condition if it cares).
    pos: list[float] = []
    in_pos = False
    reasons: dict[int, str] = {}
    entry_label = dsl.get("name") or "DSL entry"
    exit_label = "DSL exit"
    for i in range(len(bars)):
        if not in_pos and bool(entry.iloc[i]):
            in_pos = True
            reasons[i] = entry_label
        elif in_pos and bool(exit_.iloc[i]):
            in_pos = False
            reasons[i] = exit_label
        pos.append(1.0 if in_pos else 0.0)
    position = pd.Series(pos)

    trades, equity, times = simulate_long_only(
        bars, position, ctx.initial_capital, ctx.symbol, reason_for=reasons,
    )

    # Optional auxiliary series for the chart pane.
    extras: list[NamedSeries] = []
    for ref in dsl.get("indicators_to_chart") or []:
        try:
            s = _eval_operand(ref, bars)
        except Exception:  # noqa: BLE001 — never let chart hints break a backtest
            continue
        meta = (
            get_indicator_meta(ref["indicator"])
            if isinstance(ref, dict) and "indicator" in ref
            else None
        )
        pane = meta.pane if meta is not None else "separate"
        extras.append(
            NamedSeries(
                name=_ref_label(ref),
                pane=pane,
                points=[
                    EquityPoint(
                        time=t,
                        value=(float(v) if pd.notna(v) else None),
                    )
                    for t, v in zip(bars["time"], s.tolist())
                ],
            )
        )

    return StrategyOutput(
        trades=trades,
        equity_curve=equity,
        equity_times=times,
        extra_series=extras,
    )
