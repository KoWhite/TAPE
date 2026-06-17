"""
Macro page AI analyzer.

The frontend collects a snapshot from every chart on /macro (via the
`useMacroAiContext` registry) and POSTs them as a single payload. We
hand the LLM a strict JSON schema and let it write the synthesis.

The prompt is heavy on "stick to the numbers" rules because macro
commentary is a domain where LLMs love to ad-lib. Every observation
the model emits must cite at least one chart id from the input list
— we don't enforce it post-hoc (would lose nuance) but we do check
the cited ids exist and silently strip invalid ones.

Output shape (validated):
  {
    "regime":     { "label": "...", "tone": "bullish"|"bearish"|"neutral"|"caution" },
    "headline":   "<one-sentence framing>",
    "observations": [
      { "id": "...", "title": "...", "body": "...", "cites": ["chart-id", ...],
        "tone": "bullish"|"bearish"|"neutral"|"caution" }
    ],
    "risks":      [ "...", "..." ],
    "asOf":       "<latest data date in YYYY-MM-DD, copied from input>"
  }
"""
from __future__ import annotations

import json
from typing import Any

from .json_response import request_json_object


VALID_TONES = {"bullish", "bearish", "neutral", "caution"}


SYSTEM_PROMPT = (
    "You are a macro-strategist sidekick. The user is looking at a dashboard "
    "of charts and wants a fact-grounded synthesis of what the numbers say "
    "right now. You will receive a JSON list of chart snapshots, each with "
    "an id, a description, and a small set of current metrics with units.\n\n"
    "Hard requirements:\n"
    "1. Return ONE JSON object only — no markdown, no prose outside the JSON.\n"
    "2. Schema:\n"
    "   {\n"
    '     "regime":   { "label": "<short, ≤ 40 chars>", "tone": "bullish"|"bearish"|"neutral"|"caution" },\n'
    '     "headline": "<one sentence, ≤ 220 chars>",\n'
    '     "observations": [\n'
    "       {\n"
    '         "id":    "<stable kebab-case slug>",\n'
    '         "title": "<≤ 60 chars>",\n'
    '         "body":  "<1-3 sentences, each anchored to a specific number from the input>",\n'
    '         "cites": ["<chart id from input>", ...],\n'
    '         "tone":  "bullish"|"bearish"|"neutral"|"caution"\n'
    "       }\n"
    "     ],\n"
    '     "risks": ["<1-2 short risks>", ...],\n'
    '     "asOf":  "<copy the latest `asOf` date you see in the input snapshots>"\n'
    "   }\n"
    "3. Cite numbers explicitly in `body` — e.g. 'with the 10Y at 4.45% and 2s10s inverted by 32 bp'. "
    "Never invent a metric that isn't in the input.\n"
    "4. 3 to 5 observations is the sweet spot. Don't pad to fill the array.\n"
    "5. `cites` must reference at least one input snapshot id. Multiple ids are fine.\n"
    "6. Tone reflects market implication, not data direction — e.g. rising unemployment is `bearish` for stocks, "
    "even though the unemployment number went up.\n"
    "7. If the input is sparse (1-2 snapshots), still respond — make the observations narrower.\n"
    "8. Language: write every user-facing string in Simplified Chinese (简体中文). "
    "This includes `regime.label`, `headline`, `observations[].title`, `observations[].body`, and `risks[]`. "
    "Schema keys, `tone` enum values, and `cites` ids must stay in English / lowercase exactly as specified. "
    "When citing numbers, keep the unit symbols (%, bp, $) verbatim.\n"
)


def _coerce_tone(value: Any) -> str:
    s = str(value or "").strip().lower()
    return s if s in VALID_TONES else "neutral"


def _validate_observation(row: Any, valid_ids: set[str]) -> dict | None:
    if not isinstance(row, dict):
        return None
    title = str(row.get("title") or "").strip()
    body = str(row.get("body") or "").strip()
    if not title or not body:
        return None
    cites_raw = row.get("cites") or []
    if not isinstance(cites_raw, list):
        return None
    # Strip invalid citations rather than failing the observation — the
    # body content is still useful even if the model named the wrong id.
    cites = [str(c) for c in cites_raw if str(c) in valid_ids]
    return {
        "id": str(row.get("id") or title.lower().replace(" ", "-"))[:80],
        "title": title[:80],
        "body": body[:800],
        "cites": cites,
        "tone": _coerce_tone(row.get("tone")),
    }


def analyze_macro(payload: dict) -> dict:
    snapshots = payload.get("snapshots")
    if not isinstance(snapshots, list) or not snapshots:
        raise ValueError("snapshots (non-empty array) required")

    # Sanitize the inbound list — the frontend ought to send clean shapes
    # but we re-validate so a malformed register call can't crash the LLM.
    clean: list[dict] = []
    for s in snapshots:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id") or "").strip()
        if not sid:
            continue
        metrics = s.get("metrics")
        if not isinstance(metrics, list) or not metrics:
            continue
        clean.append({
            "id": sid,
            "label": str(s.get("label") or sid)[:120],
            "description": str(s.get("description") or "")[:280],
            "asOf": str(s.get("asOf") or "")[:10] or None,
            "metrics": [
                {
                    "label": str(m.get("label") or "")[:80],
                    "value": m.get("value"),
                    "unit": str(m.get("unit") or "")[:8],
                    "note": str(m.get("note") or "")[:160] or None,
                }
                for m in metrics
                if isinstance(m, dict) and m.get("value") is not None
            ],
        })
    if not clean:
        raise ValueError("no snapshot contained usable metrics")

    valid_ids = {s["id"] for s in clean}
    # Compute the canonical asOf the model should echo — the freshest
    # date among inputs.
    as_of_candidates = [s["asOf"] for s in clean if s["asOf"]]
    canonical_as_of = max(as_of_candidates) if as_of_candidates else None

    chat_payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Macro snapshot bundle:\n```json\n"
                    + json.dumps(clean, ensure_ascii=False, default=str)
                    + "\n```\nReturn the JSON object now."
                ),
            },
        ],
        "temperature": float(payload.get("temperature") or 0.3),
        "json": True,
    }
    if payload.get("model"):
        chat_payload["model"] = payload["model"]

    parsed, raw = request_json_object(chat_payload)

    # Validate and shape the response defensively. Bad rows are dropped
    # individually — partial output still beats failing the whole call.
    regime_raw = parsed.get("regime") or {}
    regime = {
        "label": str(regime_raw.get("label") or "Mixed").strip()[:80] if isinstance(regime_raw, dict) else "Mixed",
        "tone": _coerce_tone(regime_raw.get("tone") if isinstance(regime_raw, dict) else None),
    }

    observations_raw = parsed.get("observations") or []
    observations: list[dict] = []
    if isinstance(observations_raw, list):
        for row in observations_raw[:6]:
            obs = _validate_observation(row, valid_ids)
            if obs is not None:
                observations.append(obs)

    risks_raw = parsed.get("risks") or []
    risks = (
        [str(r).strip()[:200] for r in risks_raw if str(r).strip()]
        if isinstance(risks_raw, list)
        else []
    )[:5]

    return {
        "regime": regime,
        "headline": str(parsed.get("headline") or "").strip()[:300],
        "observations": observations,
        "risks": risks,
        "asOf": canonical_as_of or str(parsed.get("asOf") or "").strip()[:10] or None,
        "model": raw.get("model"),
        "provider": raw.get("provider"),
    }
