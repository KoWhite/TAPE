"""
FRED (Federal Reserve Economic Data) series fetcher.

Single public endpoint: `fetch_fred_series(series_id, start?)`. Returns a
MacroSeries-shaped dict matching the frontend's expectation.

Reads `FRED_API_KEY` from env. A baked-in fallback key keeps dev simple,
but the env var should be set in any deployment.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

FRED_API_KEY = os.environ.get("FRED_API_KEY", "").strip()
FRED_BASE = "https://api.stlouisfed.org/fred"


def _fred_get(path: str, params: dict) -> dict:
    # No baked-in fallback key on purpose: a shared key gets rate-limited
    # the moment two people deploy this. Require each user to bring their own.
    if not FRED_API_KEY:
        raise RuntimeError(
            "FRED_API_KEY not configured — set it in the environment "
            "(get a free key at https://fred.stlouisfed.org/docs/api/api_key.html)"
        )
    qs = urllib.parse.urlencode(
        {**params, "api_key": FRED_API_KEY, "file_type": "json"}
    )
    url = f"{FRED_BASE}{path}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "tape-bridge/0.1"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # FRED returns a JSON body with `error_message` on 400/403/404.
        # Surface it to the caller so the user sees "Bad API key" instead
        # of an opaque "HTTP 400". The bridge logs the full body too.
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        message = ""
        try:
            parsed = json.loads(body) if body else {}
            message = str(parsed.get("error_message") or "").strip()
        except (json.JSONDecodeError, ValueError):
            pass
        params_summary = {k: v for k, v in params.items() if k != "api_key"}
        raise RuntimeError(
            f"FRED {path} HTTP {e.code}: {message or body or e.reason} "
            f"(params: {params_summary})"
        ) from e


def fetch_fred_series(series_id: str, start: str | None = None) -> dict:
    """Fetch FRED metadata + observations and return a clean payload."""
    meta_resp = _fred_get("/series", {"series_id": series_id})
    meta_list = meta_resp.get("seriess") or []
    if not meta_list:
        raise RuntimeError(f"FRED: series {series_id!r} not found")
    meta = meta_list[0]

    obs_params: dict = {"series_id": series_id}
    if start:
        obs_params["observation_start"] = start
    obs_resp = _fred_get("/series/observations", obs_params)

    points: list[dict] = []
    for o in obs_resp.get("observations", []):
        v = o.get("value")
        if v in (None, "", ".", "N/A"):
            continue
        try:
            points.append({"date": o["date"], "value": float(v)})
        except (TypeError, ValueError):
            continue

    return {
        "id": meta.get("id", series_id),
        "title": meta.get("title", series_id),
        "units": meta.get("units", ""),
        "unitsShort": meta.get("units_short", meta.get("units", "")),
        "frequency": meta.get("frequency", ""),
        "frequencyShort": meta.get("frequency_short", ""),
        "seasonalAdjustment": meta.get("seasonal_adjustment_short"),
        "lastUpdated": meta.get("last_updated"),
        "observationStart": meta.get("observation_start"),
        "observationEnd": meta.get("observation_end"),
        "observations": points,
    }
