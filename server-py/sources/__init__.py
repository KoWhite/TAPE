"""
Broker-agnostic data sources for the Tape Python bridge.

Every module here is HTTPS / yfinance based — no broker SDK dependency.
The bridge (`app.py`) imports symbols from this package only; it never
reaches into submodules.

Layout:
  _helpers.py        — shared coercion + symbol mapping
  earnings.py        — yfinance earnings calendar
  macro_fred.py      — FRED series fetcher
  macro_buffett.py   — Improved Buffett Indicator
  shiller.py         — Shiller CAPE (multpl.com scraper)
  sentiment.py       — CNN Fear & Greed + Polymarket top events
  news.py            — yfinance news (per-symbol + market-wide)
  analyst.py         — yfinance analyst targets + recommendations
  institutional.py   — SEC EDGAR companyfacts
  sectors.py         — SPDR sector ETFs + per-symbol classification
  yf_bars.py         — yfinance OHLCV bars (fallback for indicators / backtests)
  web_search.py      — Tavily web search (used by LLM tool calls)
"""
from __future__ import annotations

from ._helpers import (
    _opt_float,
    _safe_float,
    _to_date,
    _yf_symbol,
    now_iso,
)
from .analyst import fetch_analyst_for
from .earnings import fetch_earnings, fetch_earnings_for
from .institutional import fetch_institutional_context
from .macro_buffett import fetch_buffett_indicator
from .macro_fred import fetch_fred_series
from .taco import fetch_taco_index
from .news import fetch_market_news, fetch_news_for
from .sectors import fetch_sector_etfs, fetch_sectors
from .sentiment import fetch_fear_greed, fetch_polymarket_top
from .shiller import fetch_shiller_cape
from .web_search import search_web, web_search_configured
from .yf_bars import fetch_bars_yf


__all__ = [
    # helpers
    "_opt_float",
    "_safe_float",
    "_to_date",
    "_yf_symbol",
    "now_iso",
    # fetchers
    "fetch_analyst_for",
    "fetch_bars_yf",
    "fetch_buffett_indicator",
    "fetch_earnings",
    "fetch_earnings_for",
    "fetch_fear_greed",
    "fetch_fred_series",
    "fetch_institutional_context",
    "fetch_market_news",
    "fetch_news_for",
    "fetch_polymarket_top",
    "fetch_sector_etfs",
    "fetch_sectors",
    "fetch_shiller_cape",
    "fetch_taco_index",
    "search_web",
    "web_search_configured",
]
