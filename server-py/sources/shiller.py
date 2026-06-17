"""
Shiller CAPE (cyclically-adjusted P/E) data source.

Public source: multpl.com. We pick that mirror over Yale's `ie_data.xls`
because it's plain HTML — no XLS parser needed — and has been live for
10+ years. Fallbacks if the URL ever 404s:

  - Yale (XLS):   http://www.econ.yale.edu/~shiller/data/ie_data.xls
  - Shiller site: https://shillerdata.com/data/ie_data.xls
  - Datahub CSV:  https://github.com/datasets/s-and-p-500-shiller-pe

Swap SHILLER_URL + ROW_RE below; the rest of the module is source-agnostic.
"""
from __future__ import annotations

import re
import threading
import time
import urllib.request
from datetime import datetime, timezone

SHILLER_URL = "https://www.multpl.com/shiller-pe/table/by-month"

# multpl.com returns HTTP 400 for non-browser-looking User-Agent strings,
# so we mimic a real browser. The exact UA doesn't matter — anything
# Mozilla/Chrome-shaped works.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# multpl.com renders rows like:
#   <tr class="odd">
#   <td>Apr 29, 2026</td>
#   <td>
#   &#x2002;
#   40.53
#   </td>
#   </tr>
# The value cell has an &#x2002; (en space) entity + newlines before the
# number, so we use [\s\S]*? (non-greedy any-char incl. newlines) between
# the value <td> open and the number.
ROW_RE = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>\s*([A-Za-z]+\s+\d+,\s*\d{4})\s*</td>\s*<td[^>]*>[\s\S]*?(\d+\.\d+)",
    re.IGNORECASE,
)

TTL_S = 24 * 60 * 60

_lock = threading.Lock()
_cache: dict | None = None  # {"data": MacroSeries, "fetched_at": float}


def _parse_rows(html: str) -> list[dict]:
    points: list[dict] = []
    for m in ROW_RE.finditer(html):
        try:
            d = datetime.strptime(m.group(1).replace(",", ""), "%b %d %Y")
        except ValueError:
            continue
        try:
            v = float(m.group(2))
        except ValueError:
            continue
        points.append({"date": d.strftime("%Y-%m-%d"), "value": v})
    # multpl.com lists newest first; consumers expect ascending.
    points.sort(key=lambda p: p["date"])
    return points


def fetch_shiller_cape(force: bool = False) -> dict:
    global _cache
    now = time.time()
    with _lock:
        if not force and _cache and now - _cache["fetched_at"] < TTL_S:
            return _cache["data"]

    req = urllib.request.Request(SHILLER_URL, headers=_BROWSER_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read().decode("utf-8", errors="replace")

    observations = _parse_rows(html)
    if not observations:
        # Page reachable but parse yielded zero rows → upstream layout
        # changed. Keep stale cache so the UI doesn't go blank.
        with _lock:
            if _cache:
                return _cache["data"]
        raise RuntimeError(
            "Shiller CAPE: parse failed (upstream HTML may have changed). "
            f"Check ROW_RE in server-py/sources/shiller.py against {SHILLER_URL}"
        )

    data = {
        "id": "SHILLER_CAPE",
        "title": "Shiller CAPE — S&P 500 Cyclically-Adjusted P/E (10y real)",
        "units": "Ratio",
        "unitsShort": "Ratio",
        "frequency": "Monthly",
        "frequencyShort": "M",
        "seasonalAdjustment": None,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "observationStart": observations[0]["date"],
        "observationEnd": observations[-1]["date"],
        "observations": observations,
    }
    with _lock:
        _cache = {"data": data, "fetched_at": now}
    return data
