"""
Earnings calendar (yfinance).

Two-pass strategy because no single yfinance source is reliable:
  1. get_earnings_dates — historical EPS estimate/actual/surprise
  2. calendar           — most accurate for an upcoming report
Revenue actuals are joined from quarterly_income_stmt within ±90d of the
report date.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from ._helpers import _opt_float, _to_date, _yf_symbol, yf


def fetch_earnings_for(symbol: str) -> dict:
    """Pull next earnings date + last few reports for a US ticker."""
    if yf is None:
        return {"nextDate": None, "history": []}
    ticker = yf.Ticker(symbol)

    today = datetime.now(timezone.utc).date()
    history: list[dict] = []
    next_date: "date | None" = None
    next_eps_est: float | None = None

    # ── Source 1: get_earnings_dates ─────────────────────────────────────
    df = None
    try:
        df = ticker.get_earnings_dates(limit=16)
    except Exception:
        df = None

    if df is not None and not df.empty:
        for ts, row in df.iterrows():
            d = _to_date(ts)
            if d is None:
                continue
            eps_est = _opt_float(row.get("EPS Estimate"))
            eps_act = _opt_float(row.get("Reported EPS"))
            surprise = _opt_float(row.get("Surprise(%)"))

            if eps_act is not None:
                history.append({
                    "date": d.isoformat(),
                    "epsEstimate": eps_est,
                    "epsActual": eps_act,
                    "surprisePct": surprise,
                })
            elif d >= today:
                if next_date is None or d < next_date:
                    next_date = d
                    next_eps_est = eps_est

    # ── Source 2: calendar ───────────────────────────────────────────────
    try:
        cal = ticker.calendar
    except Exception:
        cal = None

    cal_eps_avg: float | None = None
    cal_eps_high: float | None = None
    cal_eps_low: float | None = None
    cal_rev_avg: float | None = None
    cal_rev_high: float | None = None
    cal_rev_low: float | None = None
    if isinstance(cal, dict):
        cal_eps_avg = _opt_float(cal.get("Earnings Average"))
        cal_eps_high = _opt_float(cal.get("Earnings High"))
        cal_eps_low = _opt_float(cal.get("Earnings Low"))
        cal_rev_avg = _opt_float(cal.get("Revenue Average"))
        cal_rev_high = _opt_float(cal.get("Revenue High"))
        cal_rev_low = _opt_float(cal.get("Revenue Low"))

        cal_dates = cal.get("Earnings Date") or []
        if not isinstance(cal_dates, list):
            cal_dates = [cal_dates]
        for raw in cal_dates:
            d = _to_date(raw)
            if d is None or d < today:
                continue
            if next_date is None or d < next_date:
                next_date = d
                next_eps_est = cal_eps_avg if cal_eps_avg is not None else next_eps_est

    if next_date is not None and next_eps_est is None:
        next_eps_est = cal_eps_avg

    # ── Source 3: quarterly_income_stmt — revenue actuals ────────────────
    rev_by_period: dict[date, float] = {}
    try:
        qis = ticker.quarterly_income_stmt
        if qis is not None and not qis.empty and "Total Revenue" in qis.index:
            for col, val in qis.loc["Total Revenue"].items():
                d = _to_date(col)
                v = _opt_float(val)
                if d is not None and v is not None:
                    rev_by_period[d] = v
    except Exception:
        pass

    if rev_by_period:
        sorted_periods = sorted(rev_by_period.keys(), reverse=True)
        for h in history:
            try:
                h_date = date.fromisoformat(h["date"])
            except Exception:
                continue
            for p in sorted_periods:
                delta = (h_date - p).days
                if 0 <= delta <= 90:
                    h["revenueActual"] = rev_by_period[p]
                    break

    history.sort(key=lambda r: r["date"], reverse=True)
    return {
        "nextDate": next_date.isoformat() if next_date else None,
        "nextEpsEstimate": next_eps_est,
        "nextEpsHigh": cal_eps_high if next_date else None,
        "nextEpsLow": cal_eps_low if next_date else None,
        "nextRevenueEstimate": cal_rev_avg if next_date else None,
        "nextRevenueHigh": cal_rev_high if next_date else None,
        "nextRevenueLow": cal_rev_low if next_date else None,
        "history": history[:6],
    }


def fetch_earnings(codes: list[str]) -> dict:
    """Batch endpoint — { code: { nextDate, history } }. Codes that aren't
    US tickers, or where yfinance returns nothing, get null payloads so the
    frontend can still render rows.
    """
    out: dict[str, dict | None] = {}
    if yf is None:
        return {"available": False, "results": {c: None for c in codes}}
    for code in codes:
        sym = _yf_symbol(code)
        if not sym:
            out[code] = None
            continue
        try:
            out[code] = fetch_earnings_for(sym)
        except Exception:
            out[code] = None
    return {"available": True, "results": out}
