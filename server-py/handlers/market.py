"""Quotes, search, k-line, bars, health, sectors, sector-etfs.

Endpoints that drive the watchlist / dashboard / detail-page core data
flow. Anything that comes off Futu (or the Futu→yfinance fallback for
bars) lives here.
"""
from __future__ import annotations

from futu_bridge import (
    fetch_bars_smart,
    fetch_kline,
    fetch_quotes,
    health_payload,
    search_symbols,
)
from sources import fetch_sector_etfs, fetch_sectors

from router import JsonResponse, Payload, Router, bad_request, ok


router = Router()


@router.get("/api/health")
def health(_payload: Payload) -> JsonResponse:
    return ok(health_payload())


@router.post("/api/quotes")
def quotes(payload: Payload) -> JsonResponse:
    codes = payload.get("codes") or []
    if not isinstance(codes, list) or not codes:
        return bad_request("codes (string[]) required")
    return ok(fetch_quotes(codes))


@router.post("/api/search")
def search(payload: Payload) -> JsonResponse:
    return ok(search_symbols(payload.get("query", "")))


@router.post("/api/kline")
def kline(payload: Payload) -> JsonResponse:
    code = payload.get("code")
    if not code or not isinstance(code, str):
        return bad_request("code (string) required")
    ktype = payload.get("ktype") or "K_DAY"
    autype = payload.get("autype") or "qfq"
    count = payload.get("count") or 250
    return ok(fetch_kline(code, ktype, count, autype))


@router.post("/api/bars")
def bars(payload: Payload) -> JsonResponse:
    code = payload.get("code")
    if not code or not isinstance(code, str):
        return bad_request("code (string) required")
    ktype = payload.get("ktype") or "K_DAY"
    count = int(payload.get("count") or 250)
    return ok({
        "code": code,
        "ktype": ktype,
        "bars": fetch_bars_smart(code, ktype, count),
    })


@router.get("/api/market/sector-etfs")
def sector_etfs(_payload: Payload) -> JsonResponse:
    return ok(fetch_sector_etfs())


@router.post("/api/sectors")
def sectors(payload: Payload) -> JsonResponse:
    codes = payload.get("codes") or []
    if not isinstance(codes, list) or not codes:
        return bad_request("codes (string[]) required")
    return ok(fetch_sectors(codes))
