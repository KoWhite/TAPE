"""AI endpoints — chat, streaming chat, and backtest explain/suggest/compose.

All streaming endpoints return SseResponse; the HTTP layer in app.py
handles `data: ...\\n\\n` framing and BrokenPipe tolerance.
"""
from __future__ import annotations

from ai import (
    analyze_macro,
    compose_backtest,
    explain_backtest,
    explain_backtest_stream,
    suggest_actions,
    suggest_backtest,
)
from llm import chat_completion, chat_completion_stream, list_ai_providers

from router import JsonResponse, Payload, Response, Router, SseResponse, ok


router = Router()


@router.get("/api/ai/providers")
def providers(_payload: Payload) -> JsonResponse:
    return ok(list_ai_providers())


@router.post("/api/ai/chat")
def chat(payload: Payload) -> JsonResponse:
    return ok(chat_completion(payload))


@router.post("/api/ai/chat/stream")
def chat_stream(payload: Payload) -> Response:
    return SseResponse(chat_completion_stream(payload))


@router.post("/api/ai/backtest/explain")
def backtest_explain(payload: Payload) -> JsonResponse:
    return ok(explain_backtest(payload))


@router.post("/api/ai/backtest/explain/stream")
def backtest_explain_stream(payload: Payload) -> Response:
    return SseResponse(explain_backtest_stream(payload))


@router.post("/api/ai/backtest/suggest")
def backtest_suggest(payload: Payload) -> JsonResponse:
    return ok(suggest_backtest(payload))


@router.post("/api/ai/backtest/compose")
def backtest_compose(payload: Payload) -> JsonResponse:
    return ok(compose_backtest(payload))


@router.post("/api/ai/actions")
def ai_actions(payload: Payload) -> JsonResponse:
    return ok(suggest_actions(payload))


@router.post("/api/ai/macro/analyze")
def ai_macro_analyze(payload: Payload) -> JsonResponse:
    """Synthesize a macro view from the Macro page's chart snapshots."""
    return ok(analyze_macro(payload))
