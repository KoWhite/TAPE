"""
Bar-by-bar simulators that turn strategy signals into Trade lists +
equity curves.

Two flavors today:

  simulate_long_only(bars, position, initial_capital)
      Position is a 0/1 series aligned with bars. Transitions execute at
      the *next* bar's open to avoid look-ahead bias. Either fully long
      or flat — no partial sizing yet (kept deliberately simple for the
      template stage; Stage C LLM strategies can be more elaborate).

  simulate_dca(bars, schedule, initial_capital)
      `schedule` is a list of (bar_idx, dollar_amount) buy instructions.
      Cash is added at start; each scheduled bar buys at that bar's open.
      The position is held to the end (or sold at end if force_close).

Both return: (trades, equity_curve_values, equity_curve_times).
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .schemas import Trade


def _safe_price(v) -> float:
    try:
        f = float(v)
        return f if math.isfinite(f) and f > 0 else 0.0
    except (TypeError, ValueError):
        return 0.0


def simulate_long_only(
    bars: pd.DataFrame,
    position: pd.Series,
    initial_capital: float,
    symbol: str,
    reason_for: dict[int, str] | None = None,
) -> tuple[list[Trade], list[float], list]:
    """Run a long-only simulation.

    Trade execution model:
      * Position changes are detected as `position.diff() != 0`.
      * Buys execute at NEXT bar's open (look-ahead-safe).
      * Sells execute at NEXT bar's open.
      * The final bar's signal can never execute (no next bar).
      * If a position is still open at the end of bars, it's marked-to-
        market with the last close but recorded as exit_time=None.

    `reason_for` maps bar index → human-readable reason (e.g. 'fast/slow
    MA crossed up'). Optional; falls back to a generic label.
    """
    n = len(bars)
    if n == 0:
        return [], [], []

    opens = bars["open"].astype(float).tolist()
    closes = bars["close"].astype(float).tolist()
    times = bars["time"].tolist()

    # Re-index position to bars range and forward-fill so missing bars
    # are treated as "no change".
    pos = position.reindex(range(n), fill_value=0).astype(float).tolist()
    reasons = reason_for or {}

    trades: list[Trade] = []
    equity_values: list[float] = []

    cash = float(initial_capital)
    shares = 0.0
    open_trade: dict | None = None  # accumulator for the current position

    for i in range(n):
        # 1) Mark-to-market at this bar's CLOSE → equity for the curve.
        equity_values.append(cash + shares * _safe_price(closes[i]))

        # 2) Decide if we should change position next bar. We look at
        #    today's signal vs yesterday's; transition fires at the
        #    NEXT bar's open. The last bar can never trigger an
        #    execution because there's no next bar.
        if i >= n - 1:
            continue

        prev = pos[i - 1] if i > 0 else 0.0
        cur = pos[i]
        next_open = _safe_price(opens[i + 1])
        if next_open <= 0:
            continue

        # 0 → 1: entry at next open
        if prev <= 0 and cur > 0 and shares == 0 and cash > 0:
            qty = cash / next_open  # all-in fractional shares
            shares = qty
            cash = 0.0
            open_trade = {
                "entry_time": times[i + 1],
                "entry_price": next_open,
                "size": qty,
                "reason": reasons.get(i, "entry signal"),
            }

        # 1 → 0: exit at next open
        elif prev > 0 and cur <= 0 and shares > 0 and open_trade:
            cash = shares * next_open
            entry = open_trade
            pnl = cash - entry["size"] * entry["entry_price"]
            trades.append(
                Trade(
                    entry_time=entry["entry_time"],
                    exit_time=times[i + 1],
                    side="long",
                    symbol=symbol,
                    entry_price=entry["entry_price"],
                    exit_price=next_open,
                    size=entry["size"],
                    pnl=pnl,
                    pnl_pct=(next_open / entry["entry_price"] - 1)
                    if entry["entry_price"]
                    else 0.0,
                    reason=reasons.get(i, "exit signal"),
                )
            )
            shares = 0.0
            open_trade = None

    # Position still open → mark-to-market with last close, record as
    # an unclosed Trade so the user sees what's still in flight.
    if open_trade and shares > 0:
        last_close = _safe_price(closes[-1])
        pnl = shares * last_close - open_trade["size"] * open_trade["entry_price"]
        trades.append(
            Trade(
                entry_time=open_trade["entry_time"],
                exit_time=None,
                side="long",
                symbol=symbol,
                entry_price=open_trade["entry_price"],
                exit_price=None,
                size=open_trade["size"],
                pnl=pnl,
                pnl_pct=(last_close / open_trade["entry_price"] - 1)
                if open_trade["entry_price"]
                else 0.0,
                reason="open at end",
            )
        )

    return trades, equity_values, times


def simulate_dca(
    bars: pd.DataFrame,
    schedule: list[tuple[int, float]],
    initial_capital: float,
    symbol: str,
) -> tuple[list[Trade], list[float], list]:
    """Dollar-cost averaging simulator.

    `schedule` is a sorted list of (bar_idx, dollars_to_buy). Each
    instruction triggers a buy at that bar's OPEN. Cash starts at
    `initial_capital` and is debited per buy; the strategy never sells.

    The final equity = (shares × last_close) + cash_remaining. Each
    purchase becomes a `Trade` with `exit_time=None` and the per-lot
    P&L marked against the last close.
    """
    n = len(bars)
    if n == 0:
        return [], [], []

    opens = bars["open"].astype(float).tolist()
    closes = bars["close"].astype(float).tolist()
    times = bars["time"].tolist()

    schedule_by_bar: dict[int, float] = {}
    for idx, dollars in schedule:
        if 0 <= idx < n:
            schedule_by_bar[idx] = schedule_by_bar.get(idx, 0.0) + float(dollars)

    cash = float(initial_capital)
    shares = 0.0
    lots: list[dict] = []  # each buy becomes one lot for trade attribution
    equity_values: list[float] = []

    for i in range(n):
        # Execute scheduled buy at this bar's open.
        dollars = schedule_by_bar.get(i, 0.0)
        if dollars > 0:
            px = _safe_price(opens[i])
            if px > 0:
                # Cap by available cash.
                dollars = min(dollars, cash)
                if dollars > 0:
                    qty = dollars / px
                    shares += qty
                    cash -= dollars
                    lots.append({
                        "entry_time": times[i],
                        "entry_price": px,
                        "size": qty,
                    })

        # Mark-to-market at this bar's close.
        equity_values.append(cash + shares * _safe_price(closes[i]))

    # Build per-lot Trades, marked to last close.
    trades: list[Trade] = []
    last_close = _safe_price(closes[-1])
    for lot in lots:
        pnl = lot["size"] * last_close - lot["size"] * lot["entry_price"]
        trades.append(
            Trade(
                entry_time=lot["entry_time"],
                exit_time=None,
                side="long",
                symbol=symbol,
                entry_price=lot["entry_price"],
                exit_price=None,
                size=lot["size"],
                pnl=pnl,
                pnl_pct=(last_close / lot["entry_price"] - 1)
                if lot["entry_price"]
                else 0.0,
                reason="DCA buy",
            )
        )

    return trades, equity_values, times


def benchmark_buy_hold(bars: pd.DataFrame, initial_capital: float) -> list[float]:
    """Buy-and-hold benchmark equity curve. Buys at first bar's open
    with all cash, holds to the end."""
    n = len(bars)
    if n == 0:
        return []
    opens = bars["open"].astype(float).tolist()
    closes = bars["close"].astype(float).tolist()
    entry_px = _safe_price(opens[0]) or _safe_price(closes[0]) or 1.0
    shares = float(initial_capital) / entry_px
    return [shares * _safe_price(closes[i]) for i in range(n)]
