export type KType =
  | 'K_1M'
  | 'K_5M'
  | 'K_15M'
  | 'K_30M'
  | 'K_60M'
  | 'K_DAY'
  | 'K_WEEK'
  | 'K_MON'

export type AuType = 'qfq' | 'hfq' | 'none'

/**
 * One OHLCV bar. `time` is an ISO date string ('YYYY-MM-DD') for daily
 * and above, or a unix-second number for intraday — both forms are
 * directly accepted by lightweight-charts.
 */
export interface KlineBar {
  time: string | number
  open: number
  high: number
  low: number
  close: number
  volume: number
  turnover: number
  /** Decimal — 0.0123 = +1.23% */
  changeRate: number
}

export interface KlineResponse {
  code: string
  ktype: KType
  autype: AuType
  bars: KlineBar[]
}
