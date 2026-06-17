"""App state mirror (SQLite) + cache control.

`/api/app-state` is the source of truth that backs the per-browser
Pinia stores. `/api/cache/clear` is exposed for the Settings page so
users can drop the bars / indicator caches without restarting the bridge.
"""
from __future__ import annotations

from db import (
    cache_clear,
    db_info,
    read_app_state,
    replace_app_state,
    write_app_state,
)

from router import JsonResponse, Payload, Router, bad_request, ok


router = Router()


@router.get("/api/app-state")
def get_state(_payload: Payload) -> JsonResponse:
    return ok({**db_info(), "state": read_app_state()})


@router.post("/api/app-state")
def post_state(payload: Payload) -> JsonResponse:
    state = payload.get("state")
    if not isinstance(state, dict):
        return bad_request("state (object) required")
    replace = bool(payload.get("replace"))
    result = replace_app_state(state) if replace else write_app_state(state)
    return ok({**db_info(), **result})


@router.post("/api/cache/clear")
def clear_cache(payload: Payload) -> JsonResponse:
    # Optional `prefix` filters by key family (e.g. "bars:" or
    # "indicator:"); without it clears the whole cache table.
    # Returns the number of rows dropped so the UI can confirm.
    prefix = payload.get("prefix")
    if prefix is not None and not isinstance(prefix, str):
        return bad_request("prefix must be a string")
    removed = cache_clear(prefix)
    return ok({"removed": removed, "prefix": prefix or None})
