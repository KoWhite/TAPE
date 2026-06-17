"""Market-wide and per-ticker news."""
from __future__ import annotations

from sources import fetch_market_news, fetch_news_for

from router import JsonResponse, Payload, Router, bad_request, ok


router = Router()


@router.get("/api/news/market")
def market_news(_payload: Payload) -> JsonResponse:
    return ok(fetch_market_news())


@router.post("/api/news/ticker")
def ticker_news(payload: Payload) -> JsonResponse:
    code = payload.get("code")
    if not code or not isinstance(code, str):
        return bad_request("code (string) required")
    limit = int(payload.get("limit") or 20)
    return ok(fetch_news_for(code, limit))
