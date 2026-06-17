import type { EarningsLabel, EarningsRow } from './types'

// `t` is passed in from the component so these pure helpers stay i18n-aware
// without importing the vue-i18n instance directly.
type Translator = (key: string, named?: Record<string, unknown>) => string

export function combinedBeat(
  epsPct: number | null,
  revPct: number | null,
  t: Translator,
): EarningsLabel {
  const pcts: number[] = []
  if (epsPct !== null) pcts.push(epsPct)
  if (revPct !== null) pcts.push(revPct)
  if (pcts.length === 0) return { kind: 'na', text: '--', tone: 'text-soft' }
  const allBeat = pcts.every((p) => p > 1)
  const anyMiss = pcts.some((p) => p < -1)
  if (allBeat) return { kind: 'beat', text: t('earnings.today.beat'), tone: 'text-[var(--tape-up)]' }
  if (anyMiss) return { kind: 'miss', text: t('earnings.today.miss'), tone: 'text-[var(--tape-down)]' }
  return { kind: 'inLine', text: t('earnings.today.inLine'), tone: 'text-[var(--tape-text-soft)]' }
}

export function beatLabel(surprisePct: number | null, t: Translator): EarningsLabel {
  if (surprisePct === null) return { kind: 'na', text: '--', tone: 'text-soft' }
  if (surprisePct > 1) return { kind: 'beat', text: t('earnings.today.beat'), tone: 'text-[var(--tape-up)]' }
  if (surprisePct < -1) return { kind: 'miss', text: t('earnings.today.miss'), tone: 'text-[var(--tape-down)]' }
  return { kind: 'inLine', text: t('earnings.today.inLine'), tone: 'text-[var(--tape-text-soft)]' }
}

export function dayLabel(row: EarningsRow, t: Translator, locale = 'en-US'): string {
  const d = row.daysFromToday
  if (d === 0) return t('earnings.day.today')
  if (d === 1) return t('earnings.day.tomorrow')
  if (d === -1) return t('earnings.day.yesterday')
  if (d > 0 && d <= 7) return t('earnings.day.inDays', { days: d })
  if (d < 0 && d >= -7) return t('earnings.day.daysAgo', { days: Math.abs(d) })
  const date = new Date(`${row.date}T00:00:00`)
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function dayTone(row: EarningsRow): string {
  if (row.daysFromToday <= 1 && row.daysFromToday >= 0) return 'text-[var(--tape-down)] font-semibold'
  if (row.daysFromToday > 1 && row.daysFromToday <= 7) return 'text-[var(--tape-warn)] font-medium'
  return 'text-soft'
}
