export interface PriceTargets {
  /** Last price observed by the analyst data provider — usually within a
   *  few hours of the live quote, useful as a baseline for the upside. */
  current: number | null
  mean: number | null
  median: number | null
  high: number | null
  low: number | null
}

export interface RecommendationRow {
  /** "0m" = current month, "-1m" = one month ago, etc. */
  period: string
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

export interface AnalystResponse {
  available: boolean
  code: string
  symbol?: string
  priceTargets: PriceTargets | null
  recommendations: RecommendationRow[]
  cachedAt: string
}
