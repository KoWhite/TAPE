"""
AI explanation — turn a `BacktestResult` into a short English report.

The frontend just hands us the JSON it already has on screen; we
condense the high-signal bits (stats, sample trades, equity end-points)
into a compact prompt so DeepSeek doesn't see the full multi-thousand-
point equity curve.
"""
from __future__ import annotations

from typing import Any

from llm import chat_completion, chat_completion_stream

SYSTEM_PROMPT = (
    "你是一个严谨的量化分析助手。用户会以 JSON 形式提供一次回测的结果。"
    "请用简体中文输出一份简洁的纯文本报告。不要使用 Markdown 符号、表格、列表、加粗或代码块。"
    "分为四个简短的带标签段落:整体表现、优势与不足、主要风险、后续建议。"
    "在数据支持的前提下,围绕与 Buy & Hold 基准的对比,概述 alpha、Sharpe、最大回撤、总收益率、胜率、盈亏比、"
    "交易次数、参数敏感性以及过拟合风险。"
    "每段控制在 2-3 句短句。不要原样重复表格。不要声称看到了输入中没有的字段。"
    "技术指标名称(SMA/EMA/RSI/MACD 等)、英文专有名词与数字单位(%, bp, $)保持原文。"
)


def _trade_digest(trades: list[dict], k: int = 5) -> list[dict]:
    """Pick the k biggest winners + k biggest losers as illustrations.

    The full trade list can run into thousands of rows on long DCA-style
    runs — we just need the model to see the shape.
    """
    if not trades:
        return []
    sortable = [t for t in trades if isinstance(t.get("pnl"), (int, float))]
    sortable.sort(key=lambda t: t["pnl"], reverse=True)
    head = sortable[:k]
    tail = sortable[-k:] if len(sortable) > k else []
    seen: set[int] = set()
    out: list[dict] = []
    for t in (*head, *tail):
        key = id(t)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "entryTime": t.get("entryTime"),
            "exitTime": t.get("exitTime"),
            "side": t.get("side"),
            "entryPrice": t.get("entryPrice"),
            "exitPrice": t.get("exitPrice"),
            "pnl": round(float(t["pnl"]), 4),
            "pnlPct": round(float(t.get("pnlPct") or 0), 4),
            "reason": t.get("reason"),
        })
    return out


def _equity_envelope(curve: list[dict]) -> dict | None:
    if not curve:
        return None
    values = [p.get("value") for p in curve if isinstance(p.get("value"), (int, float))]
    if not values:
        return None
    return {
        "first": round(values[0], 4),
        "last": round(values[-1], 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "points": len(values),
    }


def _build_user_payload(result: dict) -> dict:
    """Compress the BacktestResult down to <2KB so the prompt stays cheap."""
    return {
        "strategyId": result.get("strategyId"),
        "params": result.get("params"),
        "universe": result.get("universe"),
        "window": {
            "start": result.get("startDate"),
            "end": result.get("endDate"),
        },
        "initialCapital": result.get("initialCapital"),
        "finalEquity": result.get("finalEquity"),
        "stats": result.get("stats"),
        "equity": _equity_envelope(result.get("equityCurve") or []),
        "benchmark": _equity_envelope(result.get("benchmarkCurve") or []),
        "drawdown": _equity_envelope(result.get("drawdownCurve") or []),
        "tradesSummary": {
            "total": len(result.get("trades") or []),
            "samples": _trade_digest(result.get("trades") or []),
        },
        "elapsedMs": (result.get("meta") or {}).get("elapsedMs"),
    }


def _chat_payload(payload: dict) -> dict[str, Any]:
    result = payload.get("result")
    if not isinstance(result, dict):
        raise ValueError("result (BacktestResult object) required")

    user_payload = _build_user_payload(result)
    extra = (payload.get("extraInstruction") or "").strip()

    user_msg = (
        "Here is a backtest result, summarized as JSON:\n```json\n"
        f"{user_payload}\n```"
    )
    if extra:
        user_msg += f"\n\nExtra instruction: {extra}"

    return {
        "model": payload.get("model"),
        "temperature": 0.3,
        "maxTokens": 900,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    }


def explain_backtest(payload: dict) -> dict:
    """Generate a markdown explanation of a backtest result.

    `payload` shape (camelCase, matches the frontend):
        {
            "result": <BacktestResult>,
            "model":  "deepseek-v4-flash" | "deepseek-v4-pro",   # optional
            "extraInstruction": "..."                            # optional
        }
    """
    res = chat_completion(_chat_payload(payload))
    return {
        "content": res.get("content") or "",
        "model": res.get("model"),
        "provider": res.get("provider"),
        "usage": res.get("usage"),
    }


def explain_backtest_stream(payload: dict):
    yield from chat_completion_stream(_chat_payload(payload))
