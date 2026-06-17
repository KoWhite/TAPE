/**
 * Shared macro-series transforms and value formatting, used by both the
 * ECharts (`MacroChart`) and Highcharts (`MacroChartHC`) renderers. Pure
 * functions — pass the series config explicitly rather than reading props.
 */
import { formatCompact, formatNumber, formatPercent } from '@/utils/format'
import type {
  MacroPoint,
  MacroRange,
  MacroSeriesConfig,
  MacroTransform,
  MacroValueFormat,
} from '@/types/macro'

/** Apply the series' rendering mode (level / mom / mom_pct / drawdown / yoy_pct). */
export function transformMacroPoints(points: MacroPoint[], mode: MacroTransform): MacroPoint[] {
  if (mode === 'level' || points.length < 2) return points
  if (mode === 'mom') {
    return points.slice(1).map((p, i) => ({
      date: p.date,
      value: p.value - points[i].value,
    }))
  }
  if (mode === 'mom_pct') {
    return points.slice(1).map((p, i) => {
      const prev = points[i].value
      return { date: p.date, value: prev ? (p.value - prev) / prev : 0 }
    })
  }
  if (mode === 'drawdown') {
    // Underwater plot: value / running_max - 1. Always ≤0; touches 0 at
    // every new all-time high. Single forward pass over the series.
    let peak = -Infinity
    return points.map((p) => {
      if (p.value > peak) peak = p.value
      return { date: p.date, value: peak ? p.value / peak - 1 : 0 }
    })
  }
  // yoy_pct — only meaningful for monthly/quarterly series
  if (points.length < 13) return []
  return points.slice(12).map((p, i) => {
    const prev = points[i].value
    return { date: p.date, value: prev ? (p.value - prev) / prev : 0 }
  })
}

const RANGE_YEARS: Record<Exclude<MacroRange, 'ALL'>, number> = {
  '1Y': 1,
  '3Y': 3,
  '5Y': 5,
  '10Y': 10,
}

/** Clip points to the trailing window for a range (used by the SVG chart). */
export function clipMacroRange(points: MacroPoint[], r: MacroRange): MacroPoint[] {
  if (r === 'ALL' || points.length === 0) return points
  const yrs = RANGE_YEARS[r]
  const cutoff = Date.now() - yrs * 365.25 * 24 * 3600 * 1000
  return points.filter((p) => new Date(p.date).getTime() >= cutoff)
}

/** Format a value for a given series config (headline + tooltip). */
export function formatMacroValue(
  v: number,
  config: MacroSeriesConfig,
  fmt: MacroValueFormat = config.format,
): string {
  if (!Number.isFinite(v)) return '--'
  if (fmt === 'percent_signed') return formatPercent(v, config.digits ?? 2)
  if (fmt === 'percent') return `${(v * 100).toFixed(config.digits ?? 1)}%`
  if (fmt === 'percent_point') return `${v.toFixed(config.digits ?? 1)}%`
  if (fmt === 'thousands_signed') {
    const sign = v > 0 ? '+' : v < 0 ? '-' : ''
    const abs = Math.abs(v)
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}M`
    return `${sign}${Math.round(abs)}K`
  }
  return formatNumber(v, config.digits ?? 1)
}

/**
 * Change vs prior point. For percent series we show the difference in
 * percentage points (pp); for level/diff series we reuse the same units.
 */
export function formatMacroDelta(v: number, config: MacroSeriesConfig): string {
  if (!Number.isFinite(v)) return '--'
  if (config.format === 'percent_signed' || config.format === 'percent') {
    const sign = v > 0 ? '+' : v < 0 ? '-' : ''
    return `${sign}${Math.abs(v * 100).toFixed(2)} pp`
  }
  if (config.format === 'percent_point') {
    const sign = v > 0 ? '+' : v < 0 ? '-' : ''
    return `${sign}${Math.abs(v).toFixed(config.digits ?? 1)} pp`
  }
  return formatMacroValue(v, config)
}

/** Compact axis-tick label for a series config. */
export function formatMacroAxis(v: number, config: MacroSeriesConfig): string {
  const fmt = config.format
  if (fmt === 'percent_signed' || fmt === 'percent') return `${(v * 100).toFixed(1)}%`
  if (fmt === 'percent_point') return `${v.toFixed(1)}%`
  if (fmt === 'thousands_signed') {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}M`
    return `${Math.round(v)}K`
  }
  return formatCompact(v)
}
