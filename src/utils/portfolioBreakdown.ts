import type { PortfolioRow } from '@/views/Portfolio/types'

export type BreakdownBasis = 'sector' | 'symbol' | 'market'

export interface BreakdownGroup {
  /** Stable key for v-for / chart data. */
  key: string
  /** Human label shown in charts and tables. */
  label: string
  /** Aggregate market value of the group. */
  value: number
  /** Share of total portfolio value, as a decimal (0.25 = 25%). */
  weight: number
  /** Aggregate unrealized P&L of the group. */
  unrealizedPnl: number
  /** Member rows, value-descending. */
  rows: PortfolioRow[]
}

export type ConcentrationLevel = 'low' | 'medium' | 'high'

export interface Concentration {
  /** Largest single group as a decimal share. */
  top1: number
  /** Top three groups combined, as a decimal share. */
  top3: number
  /** Herfindahl-Hirschman Index over group weights (0..1). */
  hhi: number
  level: ConcentrationLevel
}

export interface PortfolioBreakdown {
  groups: BreakdownGroup[]
  concentration: Concentration
}

/** Label used for rows whose sector could not be resolved. */
const UNKNOWN_LABEL = 'Unknown'

/**
 * HHI thresholds tuned for a personal book: a single position at ~40%+ of
 * the portfolio (HHI ~0.16) reads as concentrated; a well-spread book of
 * 15+ roughly-equal names sits well under 0.10.
 */
function classifyConcentration(hhi: number): ConcentrationLevel {
  if (hhi >= 0.25) return 'high'
  if (hhi >= 0.12) return 'medium'
  return 'low'
}

/** Map a Futu-style code prefix to a market label. Codes look like
 *  `US.AAPL`, `HK.00700`, `SH.600519`, `SZ.000001` (US indices use the
 *  double-dot `US..SPX`, which still resolves to US here). */
function marketOf(code: string): string {
  const prefix = code.split('.')[0]?.toUpperCase()
  switch (prefix) {
    case 'US':
      return 'US'
    case 'HK':
      return 'Hong Kong'
    case 'SH':
    case 'SZ':
      return 'China A-Shares'
    default:
      return prefix || UNKNOWN_LABEL
  }
}

function groupKey(row: PortfolioRow, basis: BreakdownBasis, sectorOf: (code: string) => string | null | undefined): string {
  if (basis === 'symbol') return row.code || row.symbol
  if (basis === 'market') return marketOf(row.code)
  const sector = sectorOf(row.code)
  return sector && sector.trim() ? sector.trim() : UNKNOWN_LABEL
}

function groupLabel(row: PortfolioRow, basis: BreakdownBasis, key: string): string {
  return basis === 'symbol' ? row.symbol || row.code : key
}

/**
 * Aggregate priced positions into value-weighted groups plus a concentration
 * summary. Pure — takes a `sectorOf` lookup rather than reaching into a store,
 * so it stays trivially testable and recomputes reactively when sector data
 * arrives. Unpriced rows (no live quote) are skipped from value/weight so a
 * missing quote can't distort the picture.
 */
export function computeBreakdown(
  rows: PortfolioRow[],
  basis: BreakdownBasis,
  sectorOf: (code: string) => string | null | undefined,
): PortfolioBreakdown {
  const buckets = new Map<string, BreakdownGroup>()
  let total = 0

  for (const row of rows) {
    if (!row.hasQuote || row.value <= 0) continue
    total += row.value
    const key = groupKey(row, basis, sectorOf)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        key,
        label: groupLabel(row, basis, key),
        value: 0,
        weight: 0,
        unrealizedPnl: 0,
        rows: [],
      }
      buckets.set(key, bucket)
    }
    bucket.value += row.value
    bucket.unrealizedPnl += row.unrealizedPnl
    bucket.rows.push(row)
  }

  const groups = [...buckets.values()].sort((a, b) => b.value - a.value)
  for (const group of groups) {
    group.weight = total > 0 ? group.value / total : 0
    group.rows.sort((a, b) => b.value - a.value)
  }

  const hhi = groups.reduce((sum, g) => sum + g.weight * g.weight, 0)
  const concentration: Concentration = {
    top1: groups[0]?.weight ?? 0,
    top3: groups.slice(0, 3).reduce((s, g) => s + g.weight, 0),
    hhi,
    level: classifyConcentration(hhi),
  }

  return { groups, concentration }
}
