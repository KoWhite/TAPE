"""
Technical-indicator subpackage for the Tape bridge.

Three-file split (per project convention — see memory: feedback_modular_files):

  registry.py  — declarative catalog of indicators (id, category, params,
                 default values, output series shape). Pure metadata, no
                 computation. The frontend picker reads from this.

  compute.py   — actual numeric computation. Currently a pure pandas/numpy
                 implementation; the COMPUTE_BACKEND switch in this file
                 means we can drop in a vectorbt-based replacement later
                 (`compute_vbt.py`) without touching anything else.

  schemas.py   — request/response dataclass-style shapes used by the HTTP
                 layer. Keeps app.py free of inline dict
                 plumbing.

Public API (what the bridge calls):
  list_indicators()                          -> list[IndicatorMeta]
  compute(indicator_id, ohlcv, params)       -> IndicatorResult
"""
from __future__ import annotations

from .registry import IndicatorMeta, list_indicators, get_meta
from .schemas import IndicatorResult, IndicatorSeries
from .compute import compute, compute_series

__all__ = [
    "IndicatorMeta",
    "IndicatorResult",
    "IndicatorSeries",
    "list_indicators",
    "get_meta",
    "compute",
    "compute_series",
]
