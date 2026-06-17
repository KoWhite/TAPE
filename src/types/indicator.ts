/**
 * Type definitions for the technical-indicator API.
 *
 * Mirrors `server-py/indicators/registry.py` (catalog) and
 * `server-py/indicators/schemas.py` (compute result).
 */

export type IndicatorCategory = 'trend' | 'momentum' | 'volatility' | 'volume'
export type IndicatorPane = 'overlay' | 'separate'
export type ParamType = 'int' | 'float'

export interface IndicatorParamSpec {
  name: string
  type: ParamType
  default: number
  label: string
  /** When unset the input has no min/max constraint. */
  min: number | null
  max: number | null
  /** Cosmetic — drives the number input's `step` attribute. */
  step: number | null
}

/** Optional axis hints from the backend — frontend treats them as
 *  advisory only. Used to fix scales (RSI 0-100), draw reference lines
 *  (oversold 30 / overbought 70), or render a zero baseline. */
export interface ChartHints {
  yMin?: number
  yMax?: number
  refLines?: number[]
  zeroLine?: boolean
}

export interface IndicatorMeta {
  id: string
  name: string
  category: IndicatorCategory
  pane: IndicatorPane
  /** Output series names — order matters for legend display. */
  outputs: string[]
  params: IndicatorParamSpec[]
  description: string
  chartHints: ChartHints
}

export interface IndicatorCatalogResponse {
  indicators: IndicatorMeta[]
}

export interface IndicatorPoint {
  /** ISO date string for daily bars, Unix epoch second for intraday. */
  time: string | number
  /** Null for warm-up bars (e.g. SMA's first n-1 rows). */
  value: number | null
}

export interface IndicatorSeries {
  name: string
  points: IndicatorPoint[]
}

export interface IndicatorResult {
  indicatorId: string
  pane: IndicatorPane
  series: IndicatorSeries[]
  meta: {
    chartHints?: ChartHints
    backend?: string
  }
}

export interface ComputeRequest {
  code: string
  /** Defaults to K_DAY on the bridge. */
  ktype?: string
  /** Defaults to 250 on the bridge. */
  count?: number
  indicator: string
  params?: Record<string, number>
}
