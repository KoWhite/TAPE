import type { EarningsRecord } from '@/types/earnings'

export interface EarningsRow {
  code: string
  symbol: string
  date: string
  daysFromToday: number
  record: EarningsRecord
}

export interface EarningsTodayRow {
  code: string
  symbol: string
  phase: 'pre' | 'post'
  epsEstimate: number | null
  epsEstimateRange?: { low: number; high: number } | null
  epsActual: number | null
  epsSurprisePct: number | null
  revenueEstimate: number | null
  revenueEstimateRange?: { low: number; high: number } | null
  revenueActual: number | null
  revenueSurprisePct: number | null
}

export interface EarningsWeekGroup {
  label: string
  startISO: string
  rows: EarningsRow[]
}

export type EarningsBeatKind = 'beat' | 'miss' | 'inLine' | 'na'

export interface EarningsLabel {
  /** Stable kind for comparisons/styling — not for display. */
  kind: EarningsBeatKind
  text: string
  tone: string
}
