"""
Indicator math — pure pandas/numpy implementations.

Why pandas/numpy and not vectorbt: the project's network couldn't reach
PyPI to install vectorbt, and the 16 indicators we currently expose are
~10-30 lines each in plain pandas. The whole file stays under 350 lines
and ships zero new dependencies.

When/if vectorbt installs successfully, drop a sibling `compute_vbt.py`
that exposes the same `compute(...)` signature, and flip
`COMPUTE_BACKEND` below. Nothing else needs to change.

Public API:
  compute(indicator_id, ohlcv, params)  -> IndicatorResult
"""
from __future__ import annotations

import math
from typing import Callable

import numpy as np
import pandas as pd

from .registry import get_meta
from .schemas import IndicatorPoint, IndicatorResult, IndicatorSeries

# Sentinel for the future swap. Currently pandas-only; flip to "vectorbt"
# once compute_vbt.py exists and vectorbt is installed.
COMPUTE_BACKEND = "pandas"


# ── Helpers ────────────────────────────────────────────────────────────
def _to_points(series: pd.Series, times: list) -> list[IndicatorPoint]:
    """Convert a (time-aligned) pandas Series into the wire format. NaN
    values become `None` so the frontend can skip warm-up bars cleanly."""
    out: list[IndicatorPoint] = []
    for t, v in zip(times, series.tolist()):
        if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
            out.append(IndicatorPoint(time=t, value=None))
        else:
            out.append(IndicatorPoint(time=t, value=float(v)))
    return out


def _typical_price(df: pd.DataFrame) -> pd.Series:
    """(high + low + close) / 3 — used by VWAP, MFI, CCI."""
    return (df["high"] + df["low"] + df["close"]) / 3.0


def _true_range(df: pd.DataFrame) -> pd.Series:
    """Greatest of: high-low, |high-prevClose|, |low-prevClose|."""
    prev_close = df["close"].shift(1)
    tr1 = df["high"] - df["low"]
    tr2 = (df["high"] - prev_close).abs()
    tr3 = (df["low"] - prev_close).abs()
    return pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)


def _wilder_smooth(series: pd.Series, window: int) -> pd.Series:
    """Wilder's smoothing — same as EMA with alpha = 1/window. Used by
    ATR and ADX per their original 1978 definition."""
    return series.ewm(alpha=1.0 / window, adjust=False).mean()


# ── Trend (overlay) ────────────────────────────────────────────────────
def _sma(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 20))
    return {"sma": df["close"].rolling(w, min_periods=w).mean()}


def _ema(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 20))
    return {"ema": df["close"].ewm(span=w, adjust=False).mean()}


def _wma(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 20))
    weights = np.arange(1, w + 1, dtype=float)
    weights /= weights.sum()
    wma = df["close"].rolling(w, min_periods=w).apply(
        lambda x: float(np.dot(x, weights)), raw=True
    )
    return {"wma": wma}


def _bbands(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 20))
    k = float(params.get("stddev", 2.0))
    middle = df["close"].rolling(w, min_periods=w).mean()
    sd = df["close"].rolling(w, min_periods=w).std(ddof=0)
    return {
        "upper": middle + k * sd,
        "middle": middle,
        "lower": middle - k * sd,
    }


def _vwap(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    # Cumulative VWAP — anchored at the first bar in the series. For
    # session-anchored VWAP the caller must split per session before
    # passing the frame in.
    tp = _typical_price(df)
    pv = tp * df["volume"]
    return {"vwap": pv.cumsum() / df["volume"].cumsum()}


# ── Momentum (separate pane) ───────────────────────────────────────────
def _rsi(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 14))
    delta = df["close"].diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = _wilder_smooth(gain, w)
    avg_loss = _wilder_smooth(loss, w)
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.where(avg_loss > 0, 100)  # all-gain → 100
    return {"rsi": rsi}


def _macd(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    fast = int(params.get("fast", 12))
    slow = int(params.get("slow", 26))
    sig_w = int(params.get("signal", 9))
    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=sig_w, adjust=False).mean()
    return {
        "macd": macd_line,
        "signal": signal_line,
        "histogram": macd_line - signal_line,
    }


def _stoch(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    k_w = int(params.get("k_period", 14))
    d_w = int(params.get("d_period", 3))
    lo = df["low"].rolling(k_w, min_periods=k_w).min()
    hi = df["high"].rolling(k_w, min_periods=k_w).max()
    k = 100 * (df["close"] - lo) / (hi - lo).replace(0, np.nan)
    d = k.rolling(d_w, min_periods=d_w).mean()
    return {"k": k, "d": d}


def _willr(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 14))
    hi = df["high"].rolling(w, min_periods=w).max()
    lo = df["low"].rolling(w, min_periods=w).min()
    willr = -100 * (hi - df["close"]) / (hi - lo).replace(0, np.nan)
    return {"willr": willr}


def _cci(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 20))
    tp = _typical_price(df)
    sma_tp = tp.rolling(w, min_periods=w).mean()
    # Mean absolute deviation, not std — that's the original Lambert formula.
    mad = tp.rolling(w, min_periods=w).apply(
        lambda x: float(np.mean(np.abs(x - np.mean(x)))), raw=True
    )
    cci = (tp - sma_tp) / (0.015 * mad.replace(0, np.nan))
    return {"cci": cci}


def _roc(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 12))
    ref = df["close"].shift(w)
    roc = 100 * (df["close"] - ref) / ref.replace(0, np.nan)
    return {"roc": roc}


# ── Volatility (separate pane) ─────────────────────────────────────────
def _atr(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 14))
    return {"atr": _wilder_smooth(_true_range(df), w)}


def _stddev(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 20))
    return {"stddev": df["close"].rolling(w, min_periods=w).std(ddof=0)}


# ── Volume (separate pane) ─────────────────────────────────────────────
def _obv(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    direction = np.sign(df["close"].diff().fillna(0))
    obv = (direction * df["volume"]).cumsum()
    return {"obv": obv}


def _mfi(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 14))
    tp = _typical_price(df)
    raw_flow = tp * df["volume"]
    flow_dir = np.sign(tp.diff().fillna(0))
    pos_flow = raw_flow.where(flow_dir > 0, 0).rolling(w, min_periods=w).sum()
    neg_flow = raw_flow.where(flow_dir < 0, 0).rolling(w, min_periods=w).sum()
    ratio = pos_flow / neg_flow.replace(0, np.nan)
    mfi = 100 - (100 / (1 + ratio))
    mfi = mfi.where(neg_flow > 0, 100)
    return {"mfi": mfi}


# ── Trend strength ─────────────────────────────────────────────────────
def _adx(df: pd.DataFrame, params: dict) -> dict[str, pd.Series]:
    w = int(params.get("window", 14))
    up = df["high"].diff()
    dn = -df["low"].diff()
    plus_dm = ((up > dn) & (up > 0)).astype(float) * up
    minus_dm = ((dn > up) & (dn > 0)).astype(float) * dn
    atr = _wilder_smooth(_true_range(df), w)
    plus_di = 100 * _wilder_smooth(plus_dm, w) / atr.replace(0, np.nan)
    minus_di = 100 * _wilder_smooth(minus_dm, w) / atr.replace(0, np.nan)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = _wilder_smooth(dx, w)
    return {"adx": adx, "plus_di": plus_di, "minus_di": minus_di}


# ── Dispatch ───────────────────────────────────────────────────────────
ComputeFn = Callable[[pd.DataFrame, dict], dict[str, pd.Series]]

_COMPUTE: dict[str, ComputeFn] = {
    "sma": _sma,
    "ema": _ema,
    "wma": _wma,
    "bbands": _bbands,
    "vwap": _vwap,
    "rsi": _rsi,
    "macd": _macd,
    "stoch": _stoch,
    "willr": _willr,
    "cci": _cci,
    "roc": _roc,
    "atr": _atr,
    "stddev": _stddev,
    "obv": _obv,
    "mfi": _mfi,
    "adx": _adx,
}


def compute_series(
    indicator_id: str,
    ohlcv: pd.DataFrame,
    params: dict | None = None,
) -> dict[str, pd.Series]:
    """Run one indicator and return its raw pandas Series outputs.

    Same dispatch path as `compute()` but skips the wire-format conversion
    so callers (e.g. the DSL backtest interpreter) can chain math without
    round-tripping through IndicatorPoint.
    """
    if get_meta(indicator_id) is None:
        raise ValueError(f"Unknown indicator: {indicator_id!r}")
    fn = _COMPUTE.get(indicator_id)
    if fn is None:
        raise ValueError(f"No compute function registered for {indicator_id!r}")
    return fn(ohlcv, dict(params or {}))


def compute(
    indicator_id: str,
    ohlcv: pd.DataFrame,
    params: dict | None = None,
) -> IndicatorResult:
    """Compute one indicator over an OHLCV frame.

    `ohlcv` must have lowercase columns: open, high, low, close, volume,
    and a `time` column carrying the original frontend-friendly time
    (ISO date or epoch second). The frame need not be sorted — we don't
    sort here; the caller passes time-ordered bars from the bridge.
    """
    meta = get_meta(indicator_id)
    if meta is None:
        raise ValueError(f"Unknown indicator: {indicator_id!r}")
    fn = _COMPUTE.get(indicator_id)
    if fn is None:
        raise ValueError(f"No compute function registered for {indicator_id!r}")

    params = dict(params or {})
    series_map = fn(ohlcv, params)

    # Preserve the registry's declared output order so the frontend
    # legend matches the catalog. Any series missing from the compute
    # output is rendered empty — defensive against silent regressions.
    times = ohlcv["time"].tolist()
    series_out: list[IndicatorSeries] = []
    for name in meta.outputs:
        s = series_map.get(name)
        if s is None:
            series_out.append(IndicatorSeries(name=name, points=[]))
            continue
        series_out.append(
            IndicatorSeries(name=name, points=_to_points(s, times))
        )

    return IndicatorResult(
        indicator_id=indicator_id,
        pane=meta.pane,
        series=series_out,
        meta={
            "chartHints": meta.chart_hints,
            "backend": COMPUTE_BACKEND,
        },
    )
