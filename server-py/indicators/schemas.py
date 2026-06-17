"""
Request / response shapes for the indicators API.

Plain dataclasses (no pydantic dep) — the bridge serializes them via the
`to_dict()` helpers below. This keeps schemas.py free of HTTP / JSON
concerns and makes the contract obvious to any frontend consumer.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class IndicatorPoint:
    """One (time, value) pair for an indicator output series.

    `time` is an ISO 8601 string for daily bars or a Unix epoch second
    for intraday bars — same convention as `kline.bars[].time` so the
    frontend's chart libs accept either without conversion."""

    time: int | str
    value: float | None  # None for warm-up bars (e.g. SMA's first n-1 rows)


@dataclass
class IndicatorSeries:
    """One named output series — an indicator like MACD has three:
    `macd`, `signal`, `histogram`."""

    name: str
    points: list[IndicatorPoint] = field(default_factory=list)


@dataclass
class IndicatorResult:
    """Full result of computing one indicator on one ticker."""

    indicator_id: str
    """ Where to render the indicator: overlay on price, or in a separate
        pane stacked below. """
    pane: str  # "overlay" | "separate"
    series: list[IndicatorSeries] = field(default_factory=list)
    """ Optional axis hints for the chart — fixed scales (RSI 0-100),
        reference lines (oversold 30 / overbought 70), zero baseline,
        etc. Frontend treats them as advisory only. """
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        # Prefer hand-rolled shape (camelCase) over asdict(self) — the
        # frontend convention is camelCase and `points` already nests
        # cleanly via list-of-dicts.
        return {
            "indicatorId": self.indicator_id,
            "pane": self.pane,
            "series": [
                {
                    "name": s.name,
                    "points": [asdict(p) for p in s.points],
                }
                for s in self.series
            ],
            "meta": self.meta,
        }
