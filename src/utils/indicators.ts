/**
 * Pure-function technical indicators consumed by `KlineChart`. Inputs are
 * arrays of closes in chronological order; outputs are arrays of the same
 * length, with leading entries set to `null` while the indicator is still
 * warming up. Callers should drop `null` rows before passing to charts.
 */

export type Series<T> = (T | null)[]

export function sma(values: number[], period: number): Series<number> {
  const out: Series<number> = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/**
 * Exponential moving average. Seeds with the SMA of the first `period`
 * values so the early output isn't dominated by `values[0]` — same
 * convention as Wilder / standard charting libraries.
 */
export function ema(values: number[], period: number): Series<number> {
  const out: Series<number> = new Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Bollinger Bands — { upper, middle, lower } using SMA + sample stdev. */
export function boll(
  values: number[],
  period = 20,
  mult = 2,
): { upper: Series<number>; middle: Series<number>; lower: Series<number> } {
  const middle = sma(values, period)
  const upper: Series<number> = new Array(values.length).fill(null)
  const lower: Series<number> = new Array(values.length).fill(null)
  if (values.length < period) return { upper, middle, lower }
  for (let i = period - 1; i < values.length; i++) {
    const m = middle[i]
    if (m === null) continue
    let varSum = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - m
      varSum += d * d
    }
    const sd = Math.sqrt(varSum / period)
    upper[i] = m + mult * sd
    lower[i] = m - mult * sd
  }
  return { upper, middle, lower }
}

/**
 * Relative Strength Index, Wilder smoothing with `period`. Returns
 * percentage values 0..100 (or null while warming up).
 */
export function rsi(values: number[], period = 14): Series<number> {
  const out: Series<number> = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    gain = (gain * (period - 1) + g) / period
    loss = (loss * (period - 1) + l) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/**
 * MACD using the classic 12/26/9 default. `hist` follows the Chinese
 * trader convention `2 * (DIF - DEA)` so the bars are visually weighted.
 */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { dif: Series<number>; dea: Series<number>; hist: Series<number> } {
  const fastEma = ema(values, fast)
  const slowEma = ema(values, slow)
  const dif: Series<number> = values.map((_, i) => {
    const a = fastEma[i]
    const b = slowEma[i]
    return a === null || b === null ? null : a - b
  })
  // EMA of DIF for DEA — work on a compacted array (drop leading nulls).
  const compact: number[] = []
  const startIdx = dif.findIndex((v) => v !== null)
  if (startIdx >= 0) {
    for (let i = startIdx; i < dif.length; i++) compact.push(dif[i] as number)
  }
  const deaCompact = ema(compact, signal)
  const dea: Series<number> = new Array(values.length).fill(null)
  for (let i = 0; i < deaCompact.length; i++) {
    dea[startIdx + i] = deaCompact[i]
  }
  const hist: Series<number> = values.map((_, i) => {
    const d = dif[i]
    const e = dea[i]
    return d === null || e === null ? null : 2 * (d - e)
  })
  return { dif, dea, hist }
}
