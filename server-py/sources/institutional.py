"""
SEC EDGAR company fundamentals — TTM revenue/income/cash flow + latest
balance sheet items, plus derived margin/ROE/leverage ratios.

Uses SEC's free companyfacts API (CIK-keyed). Two layers of cache:
ticker→CIK map (7d TTL) and per-CIK companyfacts (12h TTL).

Only US-listed operating companies are supported (10-K/10-Q/20-F/40-F).
"""
from __future__ import annotations

import json
import os
import re
import threading
import urllib.request
from datetime import datetime, timezone

from ._helpers import _opt_float, _safe_float, _yf_symbol, now_iso


# SEC companyfacts are low-frequency and relatively heavy. Keep a bridge-side
# cache so the detail page can reuse the same payload across AI runs.
_SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_SEC_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
_SEC_USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "Tape personal dashboard contact@example.com",
)
_SEC_TICKERS_CACHE: dict = {"data": None, "fetched_at": 0.0}
_SEC_FACTS_CACHE: dict[str, dict] = {}
_SEC_LOCK = threading.Lock()
_SEC_TICKERS_TTL_S = 7 * 24 * 60 * 60
_SEC_FACTS_TTL_S = 12 * 60 * 60
_SEC_FORMS = {"10-K", "10-Q", "20-F", "40-F"}


def _sec_get_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": _SEC_USER_AGENT,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def _sec_normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper().replace(".", "-")


def _sec_ticker_map() -> dict[str, dict]:
    now = datetime.now(timezone.utc).timestamp()
    with _SEC_LOCK:
        cached = _SEC_TICKERS_CACHE.get("data")
        fetched_at = float(_SEC_TICKERS_CACHE.get("fetched_at") or 0.0)
        if cached is not None and (now - fetched_at) < _SEC_TICKERS_TTL_S:
            return cached

    raw = _sec_get_json(_SEC_TICKERS_URL)
    mapping: dict[str, dict] = {}
    for row in raw.values():
        ticker = _sec_normalize_symbol(str(row.get("ticker") or ""))
        cik = row.get("cik_str")
        if not ticker or cik is None:
            continue
        mapping[ticker] = {
            "cik": str(cik).zfill(10),
            "ticker": ticker,
            "title": row.get("title") or ticker,
        }

    with _SEC_LOCK:
        _SEC_TICKERS_CACHE["data"] = mapping
        _SEC_TICKERS_CACHE["fetched_at"] = now
    return mapping


def _sec_company_facts(cik: str) -> dict:
    now = datetime.now(timezone.utc).timestamp()
    with _SEC_LOCK:
        cached = _SEC_FACTS_CACHE.get(cik)
        if cached and (now - float(cached["fetched_at"])) < _SEC_FACTS_TTL_S:
            return cached["data"]

    facts = _sec_get_json(_SEC_FACTS_URL.format(cik=cik))
    with _SEC_LOCK:
        _SEC_FACTS_CACHE[cik] = {"data": facts, "fetched_at": now}
    return facts


def _sec_usd_items(facts: dict, concepts: list[str]) -> list[dict]:
    gaap = (facts.get("facts") or {}).get("us-gaap") or {}
    out: list[dict] = []
    for concept in concepts:
        units = (gaap.get(concept) or {}).get("units") or {}
        for item in units.get("USD") or []:
            if item.get("form") not in _SEC_FORMS:
                continue
            val = _opt_float(item.get("val"))
            if val is None:
                continue
            out.append({**item, "val": val, "concept": concept})
    return out


def _sec_latest_value(facts: dict, concepts: list[str]) -> dict | None:
    items = _sec_usd_items(facts, concepts)
    if not items:
        return None
    items.sort(
        key=lambda x: (
            str(x.get("filed") or ""),
            str(x.get("end") or ""),
            str(x.get("accn") or ""),
        ),
        reverse=True,
    )
    item = items[0]
    return {
        "value": item["val"],
        "end": item.get("end"),
        "filed": item.get("filed"),
        "form": item.get("form"),
        "concept": item.get("concept"),
    }


def _sec_quarterly_flow(facts: dict, concepts: list[str]) -> list[dict]:
    by_frame: dict[str, dict] = {}
    for item in _sec_usd_items(facts, concepts):
        frame = str(item.get("frame") or "")
        # SEC uses quarterly duration frames like CY2024Q3 for income and
        # cash-flow facts. Balance-sheet instants use CY2024Q3I and are
        # handled separately by _sec_latest_value.
        if not re.search(r"Q[1-4]$", frame):
            continue
        existing = by_frame.get(frame)
        if existing is None or str(item.get("filed") or "") > str(existing.get("filed") or ""):
            by_frame[frame] = item
    rows = [
        {
            "value": item["val"],
            "end": item.get("end"),
            "filed": item.get("filed"),
            "frame": frame,
            "form": item.get("form"),
            "concept": item.get("concept"),
        }
        for frame, item in by_frame.items()
    ]
    rows.sort(key=lambda x: str(x.get("end") or ""), reverse=True)
    return rows


def _sec_ttm_value(facts: dict, concepts: list[str]) -> dict | None:
    quarters = _sec_quarterly_flow(facts, concepts)[:4]
    if len(quarters) < 4:
        return None
    value = sum(_safe_float(q.get("value")) for q in quarters)
    return {
        "value": value,
        "quarters": quarters,
        "end": quarters[0].get("end"),
        "filed": quarters[0].get("filed"),
    }


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def fetch_institutional_context(code: str) -> dict:
    """Free, low-frequency company context for the stock detail AI prompt.

    v1 intentionally uses SEC EDGAR companyfacts only: it is free,
    official, and changes slowly enough to cache aggressively. Unsupported
    symbols return an unavailable payload instead of failing the detail page.
    """
    sym = _yf_symbol(code)
    base = {
        "available": False,
        "code": code,
        "symbol": sym,
        "cachedAt": now_iso(),
        "source": "sec-companyfacts",
        "notes": [],
    }
    if not sym or sym.startswith("."):
        return {**base, "notes": ["Only US listed operating companies are supported."]}

    try:
        ticker_map = _sec_ticker_map()
        company = ticker_map.get(_sec_normalize_symbol(sym))
        if not company:
            return {**base, "notes": ["SEC companyfacts did not match this ticker."]}
        facts = _sec_company_facts(company["cik"])
    except Exception as e:
        return {**base, "notes": [f"SEC data unavailable: {e}"]}

    revenue = _sec_ttm_value(facts, [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
    ])
    net_income = _sec_ttm_value(facts, ["NetIncomeLoss"])
    operating_income = _sec_ttm_value(facts, ["OperatingIncomeLoss"])
    operating_cash_flow = _sec_ttm_value(facts, ["NetCashProvidedByUsedInOperatingActivities"])
    capex = _sec_ttm_value(facts, [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
    ])
    assets = _sec_latest_value(facts, ["Assets"])
    liabilities = _sec_latest_value(facts, ["Liabilities"])
    equity = _sec_latest_value(facts, [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ])
    cash = _sec_latest_value(facts, [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    ])

    revenue_value = revenue["value"] if revenue else None
    net_income_value = net_income["value"] if net_income else None
    operating_income_value = operating_income["value"] if operating_income else None
    assets_value = assets["value"] if assets else None
    liabilities_value = liabilities["value"] if liabilities else None
    equity_value = equity["value"] if equity else None
    capex_value = capex["value"] if capex else None
    ocf_value = operating_cash_flow["value"] if operating_cash_flow else None

    metrics = {
        "revenueTtm": revenue_value,
        "netIncomeTtm": net_income_value,
        "operatingIncomeTtm": operating_income_value,
        "operatingCashFlowTtm": ocf_value,
        "capexTtm": capex_value,
        "freeCashFlowTtm": (ocf_value - capex_value) if ocf_value is not None and capex_value is not None else None,
        "assets": assets_value,
        "liabilities": liabilities_value,
        "equity": equity_value,
        "cash": cash["value"] if cash else None,
        "netMarginTtm": _ratio(net_income_value, revenue_value),
        "operatingMarginTtm": _ratio(operating_income_value, revenue_value),
        "roeTtm": _ratio(net_income_value, equity_value),
        "liabilitiesToAssets": _ratio(liabilities_value, assets_value),
    }

    latest_filed = max(
        [x.get("filed") for x in [revenue, net_income, assets, liabilities, equity] if x and x.get("filed")],
        default=None,
    )
    return {
        **base,
        "available": True,
        "companyName": company["title"],
        "cik": company["cik"],
        "metrics": metrics,
        "periods": {
            "latestFlowEnd": revenue.get("end") if revenue else None,
            "latestBalanceSheetEnd": assets.get("end") if assets else None,
            "latestFiled": latest_filed,
        },
        "notes": [
            "SEC figures are filing-based and cached for 12h.",
            "TTM uses the latest four discrete quarterly frames when available.",
        ],
    }
