"""CNN Fear & Greed + Polymarket top events.

Both endpoints are cached in SQLite at the source layer (see
sources/sentiment.py) — handlers just call through.
"""
from __future__ import annotations

from sources import fetch_fear_greed, fetch_polymarket_top

from router import JsonResponse, Payload, Router, ok


router = Router()


@router.get("/api/cnn/fear-greed")
def cnn_fear_greed(_payload: Payload) -> JsonResponse:
    return ok(fetch_fear_greed())


@router.get("/api/polymarket/top")
def polymarket_top(_payload: Payload) -> JsonResponse:
    return ok(fetch_polymarket_top())
