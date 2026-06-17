"""Reference data — earnings, analyst, institutional, macro (FRED / Shiller / Buffett).

Slow-changing context attached to individual symbols and the wider market.
"""
from __future__ import annotations

from sources import (
    fetch_analyst_for,
    fetch_buffett_indicator,
    fetch_earnings,
    fetch_fred_series,
    fetch_institutional_context,
    fetch_shiller_cape,
    fetch_taco_index,
)

from router import JsonResponse, Payload, Router, bad_request, ok


router = Router()


@router.post("/api/earnings")
def earnings(payload: Payload) -> JsonResponse:
    codes = payload.get("codes") or []
    if not isinstance(codes, list) or not codes:
        return bad_request("codes (string[]) required")
    return ok(fetch_earnings(codes))


@router.post("/api/analyst")
def analyst(payload: Payload) -> JsonResponse:
    code = payload.get("code")
    if not code or not isinstance(code, str):
        return bad_request("code (string) required")
    return ok(fetch_analyst_for(code))


@router.post("/api/institutional/context")
def institutional_context(payload: Payload) -> JsonResponse:
    code = payload.get("code")
    if not code or not isinstance(code, str):
        return bad_request("code (string) required")
    return ok(fetch_institutional_context(code))


@router.post("/api/fred/series")
def fred_series(payload: Payload) -> JsonResponse:
    series_id = payload.get("seriesId") or payload.get("series_id")
    if not series_id or not isinstance(series_id, str):
        return bad_request("seriesId (string) required")
    start = payload.get("start")
    return ok(fetch_fred_series(series_id, start))


@router.post("/api/shiller/cape")
def shiller_cape(_payload: Payload) -> JsonResponse:
    return ok(fetch_shiller_cape())


@router.post("/api/macro/buffett-indicator")
def buffett_indicator(payload: Payload) -> JsonResponse:
    start = payload.get("start")
    return ok(fetch_buffett_indicator(start))


@router.post("/api/macro/taco")
def taco_index(payload: Payload) -> JsonResponse:
    window = payload.get("window") or 20
    start = payload.get("start")
    return ok(fetch_taco_index(window=window, start=start))
