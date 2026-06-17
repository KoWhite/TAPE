export interface InstitutionalMetrics {
  revenueTtm: number | null
  netIncomeTtm: number | null
  operatingIncomeTtm: number | null
  operatingCashFlowTtm: number | null
  capexTtm: number | null
  freeCashFlowTtm: number | null
  assets: number | null
  liabilities: number | null
  equity: number | null
  cash: number | null
  netMarginTtm: number | null
  operatingMarginTtm: number | null
  roeTtm: number | null
  liabilitiesToAssets: number | null
}

export interface InstitutionalPeriods {
  latestFlowEnd: string | null
  latestBalanceSheetEnd: string | null
  latestFiled: string | null
}

export interface InstitutionalContext {
  available: boolean
  code: string
  symbol?: string | null
  companyName?: string
  cik?: string
  source: string
  cachedAt: string
  metrics?: InstitutionalMetrics
  periods?: InstitutionalPeriods
  notes: string[]
}
