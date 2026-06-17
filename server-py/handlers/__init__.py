"""Composes the per-domain routers into a single root Router.

Importing `root_router` from this package merges every domain's routes
once at startup. Adding a new endpoint: pick the right submodule (or
create a new one), register via `@router.get/post(...)`, and add a
`root_router.merge(...)` line below.
"""
from __future__ import annotations

from router import Router

from . import ai, market, news, quant, reference, sentiment, state


root_router = Router()
root_router.merge(market.router)
root_router.merge(sentiment.router)
root_router.merge(news.router)
root_router.merge(reference.router)
root_router.merge(quant.router)
root_router.merge(ai.router)
root_router.merge(state.router)


__all__ = ["root_router"]
