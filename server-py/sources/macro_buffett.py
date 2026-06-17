"""
Improved Buffett Indicator — TMC / (GDP + Fed assets).

Splices yfinance ^W5000 (1989 onward, Wilshire 5000 as TMC proxy in $B)
with FRED NCBEILQ027S (1970-1988, scaled onto the W5000 overlap). Fed
assets come from FRED WALCL (starts 2002, falls back to TMC/GDP before).

Public entrypoint: `fetch_buffett_indicator(start?)`.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from ._helpers import _safe_float, _to_date, now_iso, yf
from .macro_fred import fetch_fred_series


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _quarter_end(d: date) -> date:
    q_month = ((d.month - 1) // 3 + 1) * 3
    if q_month == 12:
        return date(d.year, 12, 31)
    return date(d.year, q_month + 1, 1) - timedelta(days=1)


def _series_points(series: dict, scale: float = 1.0) -> list[tuple[date, float]]:
    points: list[tuple[date, float]] = []
    for point in series.get("observations", []):
        d = _parse_date(point.get("date"))
        v = _safe_float(point.get("value"))
        if d and v > 0:
            points.append((d, v * scale))
    return sorted(points, key=lambda p: p[0])


def _asof_value(points: list[tuple[date, float]], target: date) -> float | None:
    value: float | None = None
    for d, v in points:
        if d > target:
            break
        value = v
    return value


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def _fetch_w5000_points(start: str = "1989-01-01") -> list[tuple[date, float]]:
    if yf is None:
        raise RuntimeError("yfinance is required for ^W5000 history")

    for symbol in ("^W5000", "^FTW5000"):
        try:
            hist = yf.Ticker(symbol).history(
                start=start,
                auto_adjust=False,
                actions=False,
            )
        except Exception:
            continue
        if hist is None or getattr(hist, "empty", True):
            continue

        col = "Adj Close" if "Adj Close" in hist.columns else "Close"
        points: list[tuple[date, float]] = []
        for idx, row in hist.iterrows():
            d = _to_date(idx)
            v = _safe_float(row.get(col))
            if d and v > 0:
                points.append((d, v))
        if points:
            return sorted(points, key=lambda p: p[0])

    raise RuntimeError("yfinance did not return ^W5000 history")


def _buffett_band(value: float) -> tuple[str, str]:
    if value <= 0.73:
        return "Severely undervalued", "up"
    if value <= 0.94:
        return "Undervalued", "up"
    if value <= 1.15:
        return "Fair", "neutral"
    if value <= 1.36:
        return "Overvalued", "warn"
    return "Severely overvalued", "down"


def _fmt_trillion(billions: float) -> str:
    return f"${billions / 1000.0:,.2f}T"


def _fmt_ratio(value: float) -> str:
    return f"{value * 100.0:,.1f}%"


def fetch_buffett_indicator(start: str | None = None) -> dict:
    """Improved Buffett Indicator.

    Formula: total market cap / (GDP + Fed assets).

    TMC uses yfinance ^W5000 from 1989 onward as a Wilshire market-cap proxy
    in billions of USD. The 1970-1988 history uses NCBEILQ027S scaled onto
    the ^W5000 overlap. WALCL starts in late 2002; before that the formula
    naturally falls back to the classic TMC/GDP ratio.
    """
    observation_start = _parse_date(start) or date(1970, 1, 1)
    fred_start = "1970-01-01"
    fred_tmc = fetch_fred_series("NCBEILQ027S", fred_start)
    gdp = fetch_fred_series("GDP", fred_start)
    walcl = fetch_fred_series("WALCL", "2002-12-01")

    # FRED values are millions of USD for NCBEILQ027S and WALCL; GDP is
    # already billions of USD. Convert numerator and Fed assets to billions.
    fred_tmc_points = _series_points(fred_tmc, 1.0 / 1000.0)
    gdp_points = _series_points(gdp)
    walcl_points = _series_points(walcl, 1.0 / 1000.0)
    w5000_points = _fetch_w5000_points()

    historical_splice_ratios: list[float] = []
    for d, tmc_b in fred_tmc_points:
        if d < date(1989, 1, 1):
            continue
        w5000 = _asof_value(w5000_points, _quarter_end(d))
        if w5000 and w5000 > 0:
            historical_splice_ratios.append(w5000 / tmc_b)
        if len(historical_splice_ratios) >= 8:
            break

    historical_splice = _median(historical_splice_ratios)
    if historical_splice is None or historical_splice <= 0:
        raise RuntimeError("Unable to calibrate NCBEILQ027S against ^W5000")

    points: list[dict] = []
    details_by_date: dict[str, list[dict]] = {}

    def add_point(
        d: date,
        tmc_b: float,
        source: str,
        index_level: float | None = None,
    ) -> None:
        gdp_b = _asof_value(gdp_points, d)
        if not gdp_b or gdp_b <= 0:
            return
        fed_assets_b = _asof_value(walcl_points, d) or 0.0
        denom = gdp_b + fed_assets_b
        if denom <= 0:
            return

        value = tmc_b / denom
        date_key = d.isoformat()
        band, tone = _buffett_band(value)
        points.append({"date": date_key, "value": value})

        rows = [
            {
                "label": "US Total Market Cap",
                "value": _fmt_trillion(tmc_b),
                "description": source,
            },
            {
                "label": "US GDP",
                "value": _fmt_trillion(gdp_b),
                "description": "FRED GDP, billions USD, quarterly SAAR",
            },
            {
                "label": "Fed Total Assets",
                "value": _fmt_trillion(fed_assets_b),
                "description": (
                    "FRED WALCL, latest weekly value as of the chart date"
                    if fed_assets_b > 0
                    else "No WALCL value yet; formula falls back to TMC/GDP"
                ),
            },
            {
                "label": "Current band",
                "value": band,
                "description": "Thresholds: <=73%, 73-94%, 94-115%, 115-136%, >136%",
                "tone": tone,
            },
            {
                "label": "Improved ratio",
                "value": _fmt_ratio(value),
                "description": "TMC / (GDP + Fed assets)",
                "tone": tone,
            },
            {
                "label": "Denominator",
                "value": _fmt_trillion(denom),
                "description": "GDP + Fed assets",
            },
            {
                "label": "TMC/GDP raw",
                "value": _fmt_ratio(tmc_b / gdp_b),
                "description": "Classic Buffett Indicator before liquidity adjustment",
            },
        ]
        if index_level is not None:
            rows.extend(
                [
                    {
                        "label": "^W5000",
                        "value": f"{index_level:,.2f}",
                        "description": "yfinance Wilshire 5000 index level",
                    },
                    {
                        "label": "Calibration",
                        "value": f"{historical_splice:,.3f}",
                        "description": "Pre-1989 NCBEILQ027S splice factor from first 8 overlap quarters",
                    },
                ]
            )
        details_by_date[date_key] = rows

    for d, tmc_b in fred_tmc_points:
        if d >= date(1989, 1, 1) or d < observation_start:
            continue
        add_point(
            d,
            tmc_b * historical_splice,
            "FRED NCBEILQ027S, converted to billions USD and spliced to ^W5000",
        )

    for d, index_level in w5000_points:
        if d < date(1989, 1, 1) or d < observation_start:
            continue
        add_point(
            d,
            index_level,
            "yfinance ^W5000, used as Wilshire 5000 market cap in billions USD",
            index_level,
        )

    points.sort(key=lambda p: p["date"])
    latest_details = details_by_date.get(points[-1]["date"], []) if points else []

    return {
        "id": "BUFFETT_ADJ_W5000",
        "title": "Improved Buffett Indicator",
        "units": "Percent",
        "unitsShort": "%",
        "frequency": "Daily from 1989; quarterly before 1989",
        "frequencyShort": "Daily",
        "seasonalAdjustment": None,
        "lastUpdated": now_iso(),
        "observationStart": points[0]["date"] if points else None,
        "observationEnd": points[-1]["date"] if points else None,
        "observations": points,
        "details": latest_details,
    }
