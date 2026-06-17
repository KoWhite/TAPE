/** Format a number as a price with locale-aware grouping. */
export function formatPrice(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) return '—'
  const fractionDigits = value >= 1000 ? 2 : value >= 10 ? 2 : 3
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

/** Plain numeric formatter — no currency, fixed digits. */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** +1.23% / -0.45% with explicit sign. */
export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(digits)}%`
}

/** +12.34 / -0.56 with explicit sign. */
export function formatChange(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}`
}

/** Compact volume / turnover: 1.23K, 4.5M, 6.78B. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  }).format(value)
}

/** Compact revenue figure: "3.45B", "456.7M". yfinance returns raw values
 *  in native currency so we scale to the nearest sensible suffix. */
export function formatRevenueCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`
  return value.toFixed(0)
}

/** Relative time: 'just now', '5s ago', '2m ago'. */
export function formatRelative(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const diff = Math.max(0, Math.floor((now - t) / 1000))
  if (diff < 2) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

export type Direction = 'up' | 'down' | 'flat'

export function direction(value: number, epsilon = 1e-6): Direction {
  if (value > epsilon) return 'up'
  if (value < -epsilon) return 'down'
  return 'flat'
}
