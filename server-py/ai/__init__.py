"""
AI orchestration layer — sits between `llm.chat_completion` (provider
adapter) and the bridge HTTP routes.

Three entrypoints, one per backtest interaction mode (see roadmap stage
C):

  explain.explain_backtest(result)         — narrative summary of a run
  suggest.suggest_backtest(payload)        — NL → existing template
  compose.compose_backtest(payload)        — NL → DSL rule tree

Each module owns its prompt + JSON-mode contract. Keeping them split
avoids a 500-line god-file and lets each prompt evolve independently —
the explain prompt is mostly natural-language; suggest and compose are
strict JSON contracts that the frontend depends on.
"""
from __future__ import annotations

from .actions import suggest_actions
from .compose import compose_backtest
from .explain import explain_backtest, explain_backtest_stream
from .macro_analyze import analyze_macro
from .screener import compile_filters, run_screen
from .suggest import suggest_backtest

__all__ = [
    "analyze_macro",
    "compile_filters",
    "compose_backtest",
    "explain_backtest",
    "explain_backtest_stream",
    "run_screen",
    "suggest_actions",
    "suggest_backtest",
]
