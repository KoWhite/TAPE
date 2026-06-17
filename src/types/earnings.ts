export interface EarningsReport {
  /** ISO date (YYYY-MM-DD) of the report. */
  date: string
  epsEstimate: number | null
  epsActual: number | null
  /** EPS surprise % as reported by yfinance (e.g. 5.2 = +5.2%). */
  surprisePct: number | null
  /** Revenue actual (native currency, raw — typically billions). Derived
   *  by the bridge from quarterly_income_stmt and matched to the call by
   *  period-end-to-call-date proximity. */
  revenueActual?: number | null
  /** Revenue estimate at the time of the call. Often null for older rows
   *  because yfinance only retains the *current* quarter's consensus. The
   *  client persists snapshots to fill this in retroactively (see
   *  earnings store). */
  revenueEstimate?: number | null
  /** Revenue surprise % — computed as (actual / estimate - 1) * 100 when
   *  both sides are known. */
  revenueSurprisePct?: number | null
}

export interface EarningsRecord {
  /** ISO date of the next upcoming earnings call, or null if unknown. */
  nextDate: string | null
  /** Consensus EPS estimate for the upcoming report. null when yfinance
   *  hasn't surfaced it yet (small-caps, recently-IPO'd, etc). */
  nextEpsEstimate?: number | null
  /** High end of the analyst EPS estimate range — useful as a "beat the
   *  street" anchor. */
  nextEpsHigh?: number | null
  /** Low end of the analyst EPS estimate range. */
  nextEpsLow?: number | null
  /** Consensus revenue estimate (native currency, raw — large numbers). */
  nextRevenueEstimate?: number | null
  /** High / low ends of analyst revenue estimate range. */
  nextRevenueHigh?: number | null
  nextRevenueLow?: number | null
  /** Most recent reports first, newest 6 max. */
  history: EarningsReport[]
}

export interface EarningsBatchResponse {
  /** False when the bridge has no yfinance installed — UI should hint. */
  available: boolean
  results: Record<string, EarningsRecord | null>
}
