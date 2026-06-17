"""
AI action recommendations — structured "what should I do next" suggestions.

Two flavors share one prompt + schema:
  - per-symbol  : the user is on the StockDetail page; payload carries
                  one ticker's quote + recent news + position context.
  - portfolio   : the user is on Overview / Portfolio; payload carries
                  the full position list and the LLM picks the most
                  pressing handful of actions.

Output schema (validated before return):
  {
    "actions": [
      {
        "code": "US.AAPL",            # required, must match an input ticker
        "symbol": "AAPL",
        "action": "buy"|"sell"|"hold"|"trim"|"stop_loss"|"take_profit",
        "confidence": 0..1,
        "rationale": "<1-2 short sentences>",
        "suggestedShares": int | null,
        "suggestedPrice":  number | null
      },
      ...
    ],
    "headline": "<one-sentence overall framing>"
  }
"""
from __future__ import annotations

import json
from typing import Any

from .json_response import request_json_object


ACTION_TYPES = {"buy", "sell", "hold", "trim", "stop_loss", "take_profit"}


SYSTEM_PROMPT = (
    "You are an investment co-pilot. The user will hand you a snapshot of "
    "one or more positions (price, P&L, recent news, optional exit plan). "
    "Return a small set of concrete, actionable next steps.\n\n"
    "Hard requirements:\n"
    "1. Return ONE JSON object only — no markdown, no prose around it.\n"
    "2. Shape:\n"
    "   {\n"
    '     "headline": "<one short sentence framing the overall picture>",\n'
    '     "actions": [\n'
    "       {\n"
    '         "code": "<must match one of the input codes>",\n'
    '         "symbol": "<ticker symbol>",\n'
    '         "action": "buy"|"sell"|"hold"|"trim"|"stop_loss"|"take_profit",\n'
    '         "confidence": <0..1 float>,\n'
    '         "rationale": "<1-2 short sentences>",\n'
    '         "suggestedShares": <integer> or null,\n'
    '         "suggestedPrice":  <number> or null\n'
    "       }\n"
    "     ]\n"
    "   }\n"
    "3. At most 5 actions. Order by importance — most pressing first.\n"
    "4. Only emit `buy`/`take_profit`/`stop_loss` actions when concrete "
    "evidence supports them (clear catalyst, plan trigger, drawdown level). "
    "When unsure, prefer `hold` with a short rationale.\n"
    "5. Use the user's currency / share precision. Do not invent positions "
    "the user does not hold.\n"
    "6. `suggestedShares` and `suggestedPrice` must be null when the action "
    "is `hold` or when you don't have enough data to size the trade.\n"
    "7. Language: write `headline` and `rationale` in Simplified Chinese (简体中文). "
    "Schema keys, `action` enum values, `code`, and `symbol` must stay in English / uppercase exactly as input. "
    "Keep currency symbols and percent signs verbatim when citing numbers.\n"
)


def _coerce_action_row(row: Any, valid_codes: set[str]) -> dict:
    if not isinstance(row, dict):
        raise ValueError("action row is not an object")
    code = str(row.get("code") or "").strip()
    if code not in valid_codes:
        raise ValueError(f"action references unknown code: {code!r}")
    action = str(row.get("action") or "").strip().lower()
    if action not in ACTION_TYPES:
        raise ValueError(f"unsupported action: {action!r}")
    confidence = row.get("confidence")
    try:
        confidence_f = float(confidence) if confidence is not None else 0.0
    except (TypeError, ValueError):
        confidence_f = 0.0
    confidence_f = max(0.0, min(1.0, confidence_f))

    def _opt_num(v, integer: bool = False):
        if v is None:
            return None
        try:
            return int(v) if integer else float(v)
        except (TypeError, ValueError):
            return None

    # `hold` shouldn't carry trade sizing — strip it so the UI doesn't
    # show a misleading "buy N shares" button next to a hold suggestion.
    suggested_shares = _opt_num(row.get("suggestedShares"), integer=True)
    suggested_price = _opt_num(row.get("suggestedPrice"))
    if action == "hold":
        suggested_shares = None
        suggested_price = None

    return {
        "code": code,
        "symbol": str(row.get("symbol") or code.split(".", 1)[-1] or ""),
        "action": action,
        "confidence": confidence_f,
        "rationale": str(row.get("rationale") or "").strip(),
        "suggestedShares": suggested_shares,
        "suggestedPrice": suggested_price,
    }


def suggest_actions(payload: dict) -> dict:
    """
    payload:
      positions: [{ code, symbol, shares?, avgCost?, last?, pnl?, weight?,
                    takeProfitPrice?, stopLossPrice?, targetWeight?,
                    news?: [{ title, source?, publishedAt? }, ...],
                    notes?: string }]
      mode:      "symbol" | "portfolio" (advisory — affects prompt only)
      model?:    optional override
      temperature?: optional override
    """
    positions = payload.get("positions") or []
    if not isinstance(positions, list) or not positions:
        raise ValueError("positions (non-empty array) required")

    valid_codes = {str(p.get("code") or "").strip() for p in positions if isinstance(p, dict)}
    valid_codes.discard("")
    if not valid_codes:
        raise ValueError("at least one position must include a code")

    mode = str(payload.get("mode") or "portfolio").lower()
    context_blob = json.dumps(
        {"mode": mode, "positions": positions},
        ensure_ascii=False,
        default=str,
    )

    chat_payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Snapshot:\n```json\n" + context_blob + "\n```\n"
                    "Return the JSON object now."
                ),
            },
        ],
        "temperature": float(payload.get("temperature") or 0.3),
        "json": True,
    }
    if payload.get("model"):
        chat_payload["model"] = payload["model"]

    parsed, raw = request_json_object(chat_payload)

    actions_raw = parsed.get("actions")
    if not isinstance(actions_raw, list):
        raise ValueError("model response missing 'actions' array")
    actions: list[dict] = []
    for row in actions_raw[:5]:
        try:
            actions.append(_coerce_action_row(row, valid_codes))
        except ValueError as e:
            # Drop bad rows individually rather than failing the whole
            # response — partial guidance still beats nothing.
            print(f"[ai.actions] dropping invalid row: {e}")

    return {
        "headline": str(parsed.get("headline") or "").strip(),
        "actions": actions,
        "model": raw.get("model"),
        "provider": raw.get("provider"),
    }
