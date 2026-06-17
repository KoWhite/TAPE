/**
 * FRED (Federal Reserve Economic Data) types.
 *
 * Series are fetched from the bridge's /api/fred/series endpoint, which
 * proxies api.stlouisfed.org and hides the API key. The bridge already
 * drops missing observations (FRED encodes them as the string '.').
 */

export interface MacroPoint {
  /** ISO date — observations are aligned to the start of the period (FRED convention). */
  date: string
  value: number
}

export interface MacroSeries {
  id: string
  title: string
  /** Long form, e.g. "Thousands of Persons". */
  units: string
  /** Short form, e.g. "Thous. of Persons". */
  unitsShort: string
  frequency: string
  frequencyShort: string
  seasonalAdjustment?: string | null
  /** ISO timestamp from FRED — when the series was last revised. */
  lastUpdated?: string | null
  observationStart?: string | null
  observationEnd?: string | null
  observations: MacroPoint[]
  details?: MacroDetail[]
}

export interface MacroDetail {
  label: string
  value: string
  description?: string
  tone?: 'up' | 'neutral' | 'warn' | 'down'
}

export interface TacoComponentPoint {
  approval: number | null
  sp500: number | null
  ust10y: number | null
  inflation: number | null
  brent: number | null
}

export interface TacoSeriesPoint {
  date: string
  total: number
  components: TacoComponentPoint
}

export interface TacoThreshold {
  min: number
  label: string
  color: string
}

export interface TacoEvent {
  date: string
  label: string
  tone: 'red' | 'gray'
}

export interface TacoComponentMeta {
  key: keyof TacoComponentPoint
  label: string
  source: string
  changeKind: 'pct' | 'diff'
  sign: number
  /** Multiplier applied to the raw change before summing (mixed-unit rescale). */
  scale?: number
  /**
   * Display unit for the scaled contribution. 'pts' = rescaled index
   * points (the current backend convention, since contributions are no
   * longer raw % / pp once scaled). '%' / 'pp' kept for back-compat with
   * older payloads.
   */
  unit: '%' | 'pp' | 'pts'
}

/** Per-component fetch status. null = ok, string = error reason. */
export type TacoSourceStatus = Partial<Record<keyof TacoComponentPoint, string | null>>

export interface TacoIndex {
  window: number
  asOf: string
  total: number
  componentsLatest: TacoComponentPoint
  series: TacoSeriesPoint[]
  thresholds: TacoThreshold[]
  events: TacoEvent[]
  componentsMeta?: TacoComponentMeta[]
  sourceStatus?: TacoSourceStatus
  lastUpdated?: string | null
}

/**
 * How to render the series. FRED returns levels; for headline indicators
 * we usually want a derived view (NFP → MoM diff, CPI → YoY %).
 *
 * `drawdown` is the "underwater" view: each point becomes `v / running_max - 1`,
 * so the line sits at 0 whenever the series is at an all-time high and dips
 * negative during drawdowns. Useful for index price series like SP500.
 */
export type MacroTransform = 'level' | 'mom' | 'mom_pct' | 'yoy_pct' | 'drawdown'

export type MacroValueFormat =
  /** Compact integer with sign — e.g. '+150K' for NFP MoM. */
  | 'thousands_signed'
  /** Decimal as percent with sign — '+3.20%'. */
  | 'percent_signed'
  /** Decimal as percent without a forced sign, e.g. '220.0%'. */
  | 'percent'
  /** Value is already in percentage points — append '%' without scaling.
   *  For FRED rate series like UNRATE/FEDFUNDS that report 4.2 (= 4.2%). */
  | 'percent_point'
  /** Plain number with locale grouping. */
  | 'number'

export interface MacroSeriesConfig {
  /** FRED series id, e.g. 'PAYEMS'. */
  id: string
  /** Display label (kept short — chart header). */
  label: string
  /** One-line description shown under the label. */
  description?: string
  transform: MacroTransform
  /** How the chart's y-axis values and the headline value are formatted. */
  format: MacroValueFormat
  /** Decimal digits for the headline value. */
  digits?: number
  /** observation_start hint sent to FRED. */
  start?: string
  /** Initial visible range for the chart. */
  defaultRange?: MacroRange
  /** Up = green, down = red? Set to false for indicators where rising is bad
   *  (e.g. unemployment, inflation). */
  positiveIsGood?: boolean
  /** Pin labels for the all-time high and the latest observation onto the
   *  chart — useful for valuation series like Shiller PE where the
   *  position relative to history is the whole point. */
  showExtremes?: boolean
  /** Optional horizontal context bands for valuation or regime charts. */
  bands?: Array<{
    from: number
    to: number
    label: string
    tone?: 'up' | 'neutral' | 'warn' | 'down'
  }>
}

export type MacroRange = '1Y' | '3Y' | '5Y' | '10Y' | 'ALL'
