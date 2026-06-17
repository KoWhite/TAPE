"""
Natural-language screener.

The LLM converts a request like "find tech stocks that pulled back to RSI
< 30 in the last week with volume above their 20-day average" into a
small filter DSL the bridge can evaluate against a user-supplied universe.

Output shape (validated):
  {
    "filters": [
      { "metric": "rsi", "params": { "window": 14 }, "op": "<", "value": 30,
        "window": "latest" },
      { "metric": "volume_ratio", "params": { "window": 20 },
        "op": ">", "value": 1.0, "window": "latest" }
    ],
    "rationale": "<short English explanation>",
    "name": "<short label suitable for a saved screen>"
  }

Supported metrics (must match _METRIC_HANDLERS keys below):
  close, change_pct_5d, change_pct_20d, change_pct_60d,
  rsi, sma, ema, volume_ratio
"""
from __future__ import annotations

import json
from typing import Any

import pandas as pd

from .json_response import request_json_object


SUPPORTED_OPS = {"<", "<=", ">", ">=", "==", "!="}


METRIC_SPECS: dict[str, dict] = {
    "close": {
        "params": [],
        "description": "Latest closing price.",
    },
    "change_pct_5d": {
        "params": [],
        "description": "Percent change over the last 5 trading days (decimal, 0.05 = +5%).",
    },
    "change_pct_20d": {
        "params": [],
        "description": "Percent change over the last 20 trading days (decimal).",
    },
    "change_pct_60d": {
        "params": [],
        "description": "Percent change over the last 60 trading days (decimal).",
    },
    "rsi": {
        "params": [{"name": "window", "type": "int", "default": 14, "min": 2, "max": 100}],
        "description": "Wilder RSI of close over `window` bars.",
    },
    "sma": {
        "params": [{"name": "window", "type": "int", "default": 20, "min": 2, "max": 400}],
        "description": "Simple moving average of close.",
    },
    "ema": {
        "params": [{"name": "window", "type": "int", "default": 20, "min": 2, "max": 400}],
        "description": "Exponential moving average of close.",
    },
    "volume_ratio": {
        "params": [{"name": "window", "type": "int", "default": 20, "min": 2, "max": 200}],
        "description": "Latest volume divided by average volume over `window` bars (1.0 = average).",
    },
}


SYSTEM_PROMPT = (
    "You are a market screener compiler. The user describes the kind of stocks they want; "
    "you translate that into a small filter DSL. Each filter is evaluated against the "
    "latest bar of each candidate ticker — emit short, conjunctive filters (AND).\n\n"
    "Hard requirements:\n"
    "1. Return ONE JSON object only, shape:\n"
    "   {\n"
    '     "name": "<short label, ≤ 40 chars>",\n'
    '     "rationale": "<1-2 sentence explanation of what the filters do>",\n'
    '     "filters": [\n'
    "       {\n"
    '         "metric": "<one of the metric ids below>",\n'
    '         "params": { "<param>": <number> },\n'
    '         "op": "<" | "<=" | ">" | ">=" | "==" | "!=",\n'
    '         "value": <number>\n'
    "       }\n"
    "     ]\n"
    "   }\n"
    "2. Use decimals for percent change (5% drop = -0.05, NOT -5).\n"
    "3. Use only metric ids from the registry below. Use only the listed `op` symbols.\n"
    "4. Keep `filters` short — 1 to 4 items. More than 4 usually means you're "
    "over-specifying.\n"
    "5. Omit markdown, prose, comments. JSON only.\n"
    "6. Language: `name` and `rationale` must be written in Simplified Chinese (简体中文). "
    "Schema keys, metric ids, and operator symbols stay in English exactly as specified.\n\n"
    "Metric registry:\n```json\n__REGISTRY_JSON__\n```"
)


def _validate_filter(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("filter is not an object")
    metric = str(raw.get("metric") or "").strip()
    if metric not in METRIC_SPECS:
        raise ValueError(f"unsupported metric: {metric!r}")
    op = str(raw.get("op") or "").strip()
    if op not in SUPPORTED_OPS:
        raise ValueError(f"unsupported op: {op!r}")
    value = raw.get("value")
    if not isinstance(value, (int, float)):
        raise ValueError(f"value must be a number, got {type(value).__name__}")
    params_in = raw.get("params") or {}
    if not isinstance(params_in, dict):
        raise ValueError("params must be an object")
    spec = METRIC_SPECS[metric]
    params: dict[str, float | int] = {}
    by_name = {p["name"]: p for p in spec["params"]}
    for k, v in params_in.items():
        if k not in by_name:
            continue
        try:
            num = float(v)
        except (TypeError, ValueError) as e:
            raise ValueError(f"param {k!r} must be a number") from e
        params[k] = int(num) if by_name[k]["type"] == "int" else num
    for p in spec["params"]:
        params.setdefault(p["name"], p["default"])
    return {
        "metric": metric,
        "op": op,
        "value": float(value),
        "params": params,
    }


def compile_filters(payload: dict) -> dict:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt (string) required")

    system = SYSTEM_PROMPT.replace(
        "__REGISTRY_JSON__",
        json.dumps(
            {k: {"params": v["params"], "description": v["description"]} for k, v in METRIC_SPECS.items()},
            ensure_ascii=False,
        ),
    )
    chat_payload = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": float(payload.get("temperature") or 0.2),
        "json": True,
    }
    if payload.get("model"):
        chat_payload["model"] = payload["model"]

    parsed, raw = request_json_object(chat_payload)
    filters_raw = parsed.get("filters")
    if not isinstance(filters_raw, list) or not filters_raw:
        raise ValueError("model response missing non-empty 'filters' array")
    filters = [_validate_filter(f) for f in filters_raw[:4]]

    return {
        "name": str(parsed.get("name") or "Untitled screen").strip()[:60],
        "rationale": str(parsed.get("rationale") or "").strip(),
        "filters": filters,
        "model": raw.get("model"),
        "provider": raw.get("provider"),
    }


# ── Metric evaluators ──────────────────────────────────────────────────
def _close(df: pd.DataFrame, _params: dict) -> float | None:
    if df.empty:
        return None
    return float(df["close"].iloc[-1])


def _change_pct_n(df: pd.DataFrame, n: int) -> float | None:
    if len(df) <= n:
        return None
    last = float(df["close"].iloc[-1])
    prev = float(df["close"].iloc[-1 - n])
    if prev == 0:
        return None
    return (last - prev) / prev


def _rsi(df: pd.DataFrame, params: dict) -> float | None:
    w = int(params.get("window", 14))
    if len(df) <= w:
        return None
    diff = df["close"].diff()
    up = diff.clip(lower=0)
    down = -diff.clip(upper=0)
    roll_up = up.ewm(alpha=1.0 / w, adjust=False).mean()
    roll_down = down.ewm(alpha=1.0 / w, adjust=False).mean()
    rs = roll_up / roll_down.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    val = rsi.iloc[-1]
    if pd.isna(val):
        return None
    return float(val)


def _sma(df: pd.DataFrame, params: dict) -> float | None:
    w = int(params.get("window", 20))
    if len(df) < w:
        return None
    return float(df["close"].rolling(w).mean().iloc[-1])


def _ema(df: pd.DataFrame, params: dict) -> float | None:
    w = int(params.get("window", 20))
    if len(df) < w:
        return None
    return float(df["close"].ewm(span=w, adjust=False).mean().iloc[-1])


def _volume_ratio(df: pd.DataFrame, params: dict) -> float | None:
    w = int(params.get("window", 20))
    if len(df) < w or "volume" not in df:
        return None
    last = float(df["volume"].iloc[-1])
    avg = float(df["volume"].rolling(w).mean().iloc[-1])
    if not avg:
        return None
    return last / avg


_METRIC_HANDLERS = {
    "close": _close,
    "change_pct_5d": lambda df, _p: _change_pct_n(df, 5),
    "change_pct_20d": lambda df, _p: _change_pct_n(df, 20),
    "change_pct_60d": lambda df, _p: _change_pct_n(df, 60),
    "rsi": _rsi,
    "sma": _sma,
    "ema": _ema,
    "volume_ratio": _volume_ratio,
}


def _compare(value: float, op: str, threshold: float) -> bool:
    if op == "<":
        return value < threshold
    if op == "<=":
        return value <= threshold
    if op == ">":
        return value > threshold
    if op == ">=":
        return value >= threshold
    if op == "==":
        return value == threshold
    if op == "!=":
        return value != threshold
    return False


def run_screen(payload: dict, fetch_bars) -> dict:
    """Evaluate a compiled filter set against a universe.

    `fetch_bars(code, ktype, count) -> list[dict]` — injected so this
    module stays decoupled from futu_bridge. Bars are pulled with the
    same fallback chain as indicators / backtests.
    """
    universe = payload.get("universe") or []
    if not isinstance(universe, list) or not universe:
        raise ValueError("universe (string[]) required")
    filters_raw = payload.get("filters") or []
    if not isinstance(filters_raw, list) or not filters_raw:
        raise ValueError("filters (non-empty array) required")
    filters = [_validate_filter(f) for f in filters_raw[:4]]

    # 250 daily bars is enough headroom for 60-day windows. Pull each code
    # serially — yfinance fallback rate-limits on parallel requests, and
    # the per-ticker cost is dominated by network I/O anyway.
    matches: list[dict] = []
    skipped: list[dict] = []
    max_window = 60
    for f in filters:
        max_window = max(max_window, int(f["params"].get("window", 0)))

    bar_count = max(120, max_window + 20)
    for code in universe[:80]:  # hard cap to keep latency bounded
        try:
            bars = fetch_bars(str(code), "K_DAY", bar_count)
        except Exception as e:
            skipped.append({"code": code, "reason": f"bars failed: {e}"})
            continue
        if not bars:
            skipped.append({"code": code, "reason": "no bars"})
            continue
        df = pd.DataFrame(bars)
        row_metrics: dict[str, float] = {}
        passed = True
        for f in filters:
            handler = _METRIC_HANDLERS.get(f["metric"])
            if handler is None:
                passed = False
                break
            val = handler(df, f["params"])
            if val is None:
                passed = False
                break
            row_metrics[f["metric"]] = val
            if not _compare(val, f["op"], f["value"]):
                passed = False
                break
        if passed:
            matches.append({
                "code": str(code),
                "last": float(df["close"].iloc[-1]),
                "metrics": row_metrics,
            })

    return {
        "filters": filters,
        "matches": matches,
        "skipped": skipped,
        "scanned": len(universe),
    }
