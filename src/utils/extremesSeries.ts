import type Highcharts from 'highcharts'
import { MONO_FONT, type ThemeTokens } from '@/utils/echartsTheme'

/**
 * Build a 2-point scatter overlay marking the all-time high and the latest
 * observation of a series. Each marker carries its own dataLabel so the
 * annotations stay pinned to the chart even as the user pans/zooms.
 *
 * Used by both `MacroChartHC` (single series) and `MacroDualChartHC` (anchored
 * to the primary y-axis). The helper is shape-agnostic — caller passes the
 * already-projected `[ts, value][]` array, the theme tokens, and a formatter.
 *
 * Edge case: if "now" is the all-time high, the two points coincide. We
 * collapse them into a single combined "Peak · Now" label so they don't
 * overdraw.
 */
export function buildExtremesSeries(opts: {
  data: [number, number][]
  theme: ThemeTokens
  /** Color of the "now" marker — usually the line's own color. */
  nowColor: string
  /** Headline-aware value formatter (percent, compact, etc.). */
  formatValue: (v: number) => string
  /** Y-axis index in the chart's `yAxis` array. Defaults to 0 (single-axis). */
  yAxis?: number
}): Highcharts.SeriesScatterOptions {
  const { data, theme: t, nowColor, formatValue, yAxis = 0 } = opts

  let peakIdx = 0
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] > data[peakIdx][1]) peakIdx = i
  }
  const lastIdx = data.length - 1
  const peak = data[peakIdx]
  const last = data[lastIdx]
  const sameDate = peakIdx === lastIdx
  const fmtDate = (ts: number): string =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

  const baseLabelStyle = {
    fontFamily: MONO_FONT,
    fontSize: '10px',
    fontWeight: '600',
    textOutline: `2px ${t.surface}`,
  }

  const points: Highcharts.PointOptionsObject[] = sameDate
    ? [
        {
          x: last[0],
          y: last[1],
          color: t.up,
          marker: { radius: 5, lineWidth: 2, lineColor: t.bgElev, fillColor: t.up },
          dataLabels: {
            enabled: true,
            format: `Peak · Now ${formatValue(last[1])}`,
            align: 'right',
            verticalAlign: 'bottom',
            x: -8,
            y: -10,
            style: { ...baseLabelStyle, color: t.up },
          },
        },
      ]
    : [
        {
          x: peak[0],
          y: peak[1],
          color: t.up,
          marker: { radius: 4, lineWidth: 2, lineColor: t.bgElev, fillColor: t.up },
          dataLabels: {
            enabled: true,
            format: `Peak ${formatValue(peak[1])} · ${fmtDate(peak[0])}`,
            align: 'center',
            verticalAlign: 'bottom',
            y: -10,
            style: { ...baseLabelStyle, color: t.up },
          },
        },
        {
          x: last[0],
          y: last[1],
          color: nowColor,
          marker: { radius: 4, lineWidth: 2, lineColor: t.bgElev, fillColor: nowColor },
          dataLabels: {
            enabled: true,
            format: `Now ${formatValue(last[1])}`,
            align: 'right',
            verticalAlign: 'middle',
            x: -8,
            style: { ...baseLabelStyle, color: nowColor },
          },
        },
      ]

  return {
    type: 'scatter',
    name: 'Extremes',
    data: points,
    yAxis,
    enableMouseTracking: false,
    showInLegend: false,
    showInNavigator: false,
    zIndex: 5,
  }
}
