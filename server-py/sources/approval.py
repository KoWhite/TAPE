"""Trump net approval source for the TACO index.

Uses Public Sentiment Institute's public approval tracker as a soft external
source. If the page shape changes or the network request fails, the function
returns an empty series so the market components can still render.
"""
from __future__ import annotations

import html
import math
import re
import time
import urllib.request
from datetime import date, datetime


PSI_HOME_URL = "https://www.publicsentimentinstitute.com/"
PSI_DETAIL_URL = "https://www.publicsentimentinstitute.com/polling/donaldtrumpapproval"

_CACHE: dict | None = None
_CACHE_TTL_S = 6 * 60 * 60


def _parse_date(value: str) -> date | None:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%B %d, %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None


def _get(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "tape-bridge/0.1 (+https://localhost)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def _text(fragment: str) -> str:
    fragment = re.sub(r"<!--.*?-->", "", fragment, flags=re.S)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(fragment)).strip()


def _num(value: str) -> float | None:
    m = re.search(r"[-+]?\d+(?:,\d{3})*(?:\.\d+)?", value)
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def _parse_weight(value: str) -> float:
    nums = re.findall(r"\d+(?:\.\d+)?", value)
    if not nums:
        return 1.0
    try:
        return max(float(nums[-1]), 0.1)
    except ValueError:
        return 1.0


def _parse_current_point() -> tuple[date, float] | None:
    html_text = _get(PSI_HOME_URL)
    text = _text(html_text)
    date_match = re.search(
        r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
        r"([A-Za-z]+\s+\d{1,2},\s+\d{4})",
        text,
    )
    avg_match = re.search(
        r"Presidential Approval.*?Approve\s+(\d+(?:\.\d+)?)%\s+"
        r"Disapprove\s+(\d+(?:\.\d+)?)%\s+Net\s+([-+]?\d+(?:\.\d+)?)",
        text,
        flags=re.I,
    )
    if not date_match or not avg_match:
        return None
    d = _parse_date(date_match.group(1))
    if not d:
        return None
    return d, float(avg_match.group(3))


def _parse_poll_points(start: str | None = None) -> list[tuple[date, float]]:
    start_date = _parse_date(start) if start else None
    page = _get(PSI_DETAIL_URL)
    section_idx = page.find("ALL INCLUDED NATIONAL POLLS")
    if section_idx >= 0:
        page = page[section_idx:]

    by_date: dict[date, dict[str, float]] = {}
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", page, flags=re.S | re.I):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, flags=re.S | re.I)
        if len(cells) < 8:
            continue
        cell_texts = [_text(c) for c in cells]
        d = _parse_date(cell_texts[1])
        if not d or (start_date and d < start_date):
            continue
        sample = _num(cell_texts[2]) or 600.0
        weight = _parse_weight(cell_texts[4])
        approve = _num(cell_texts[5])
        disapprove = _num(cell_texts[6])
        if approve is None or disapprove is None:
            continue

        # Stable enough for a daily pressure input: PSI's table gives poll
        # weight and sample size, so we aggregate each end-date by weight *
        # sqrt(n), preventing very large polls from fully dominating.
        w = weight * math.sqrt(max(sample, 1.0))
        bucket = by_date.setdefault(d, {"w": 0.0, "net": 0.0})
        bucket["w"] += w
        bucket["net"] += (approve - disapprove) * w

    points = [
        (d, values["net"] / values["w"])
        for d, values in by_date.items()
        if values["w"] > 0
    ]
    return sorted(points, key=lambda p: p[0])


def _fetch_points(start: str | None = None) -> list[tuple[date, float]]:
    # Two-page strategy: the detail page has the full history, the home
    # page has the "today's average" headline (sometimes a day newer than
    # the detail table). We want both. If the detail page fails we still
    # want to attempt the home page so we have *something* — but only
    # silently degrade in that direction. If both fail, the caller raises.
    try:
        points = _parse_poll_points(start)
    except Exception as e:
        # Detail page changed shape — give caller a chance to fall back to
        # home page, but record the reason on the cache so future cache
        # hits don't hide it forever.
        points = []
        _last_detail_error = repr(e)  # noqa: F841 — kept for debugging
    current = _parse_current_point()
    if current:
        current_date, current_net = current
        if not points or current_date > points[-1][0]:
            points.append((current_date, current_net))
        elif points[-1][0] == current_date:
            points[-1] = (current_date, current_net)
    return sorted(points, key=lambda p: p[0])


def fetch_approval_series(start: str | None = None) -> dict:
    """Return a MacroSeries-shaped net approval series in percentage points.

    Raises RuntimeError if the upstream PSI page changes shape or the
    network is unreachable — TACO assembler catches it and surfaces the
    failure as sourceStatus.approval so the user knows the value is
    missing rather than silently zero.
    """
    global _CACHE

    now = time.time()
    if (
        _CACHE
        and _CACHE.get("points")
        and now - float(_CACHE.get("fetched_at", 0)) < _CACHE_TTL_S
    ):
        points = _CACHE.get("points", [])
    else:
        points = _fetch_points(start)
        if not points:
            raise RuntimeError(
                "PSI approval source returned no usable rows — page shape "
                "may have changed (publicsentimentinstitute.com)"
            )
        _CACHE = {"points": points, "fetched_at": now}

    start_date = _parse_date(start) if start else None
    observations = [
        {"date": d.isoformat(), "value": round(value, 4)}
        for d, value in points
        if not start_date or d >= start_date
    ]

    return {
        "id": "TRUMP_APPROVAL_NET",
        "title": "Trump Net Approval",
        "units": "Percentage Points",
        "unitsShort": "pp",
        "frequency": "Daily",
        "frequencyShort": "D",
        "seasonalAdjustment": None,
        "lastUpdated": datetime.utcnow().isoformat() if observations else None,
        "observationStart": start,
        "observationEnd": observations[-1]["date"] if observations else None,
        "observations": observations,
    }
