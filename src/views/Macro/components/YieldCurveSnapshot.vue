<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type Highcharts from 'highcharts'
import { useMacroStore } from '@/stores/macro'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useHighcharts } from '@/composables/useHighcharts'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'
import { formatNumber, formatRelative } from '@/utils/format'
import { getThemeTokens, MONO_FONT } from '@/utils/echartsTheme'
import { useMacroAiContext, type ChartSnapshot } from '@/stores/macroAiContext'

/**
 * Yield-curve snapshot — yields plotted across maturity (3M → 30Y) for
 * three reference dates: today, 1 month ago, 1 year ago. The shape change
 * is the headline: bull steepener vs bear flattener vs inversion.
 *
 * Each maturity is its own FRED constant-maturity series. We pull each
 * once (the store dedups + caches) and pluck three points apiece.
 */

interface MaturitySpec {
  id: string
  /** Display label on the x axis. */
  label: string
  /** Numeric years — used for the "today vs N years ago" comparison key
   *  and as the sort order. */
  years: number
}

const MATURITIES: MaturitySpec[] = [
  { id: 'DGS3MO', label: '3M', years: 0.25 },
  { id: 'DGS6MO', label: '6M', years: 0.5 },
  { id: 'DGS1', label: '1Y', years: 1 },
  { id: 'DGS2', label: '2Y', years: 2 },
  { id: 'DGS5', label: '5Y', years: 5 },
  { id: 'DGS7', label: '7Y', years: 7 },
  { id: 'DGS10', label: '10Y', years: 10 },
  { id: 'DGS20', label: '20Y', years: 20 },
  { id: 'DGS30', label: '30Y', years: 30 },
]

// 2y of daily history is enough headroom for "1 year ago" + weekend
// padding. FRED is daily; we look up the most-recent observation on or
// before each anchor date.
const START = (() => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
})()

const macro = useMacroStore()
const { loading, errors } = storeToRefs(macro)
const { isMobile } = useBreakpoint()

function loadAll(force = false): void {
  for (const m of MATURITIES) void macro.load(m.id, { start: START, force })
}
onMounted(() => loadAll(false))

const isLoading = computed(() => MATURITIES.some((m) => loading.value[m.id]))
const allFailed = computed(() => MATURITIES.every((m) => errors.value[m.id]))
const errorMsg = computed(
  () => MATURITIES.map((m) => errors.value[m.id]).find(Boolean) ?? null,
)

const lastUpdatedRel = computed(() => {
  const t = Math.max(...MATURITIES.map((m) => macro.fetchedAt(m.id) ?? 0))
  return t ? formatRelative(new Date(t).toISOString()) : null
})

/** Anchor dates as ISO strings. Computed once per chart build via the
 *  reactive `today` getter — re-evaluates if the macro store refreshes. */
const anchors = computed(() => {
  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  const yearAgo = new Date(today)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  return [
    { key: 'today', label: 'Today', date: today.toISOString().slice(0, 10), color: '#10b981' },
    { key: 'monthAgo', label: '1 month ago', date: monthAgo.toISOString().slice(0, 10), color: '#3b82f6' },
    { key: 'yearAgo', label: '1 year ago', date: yearAgo.toISOString().slice(0, 10), color: '#94a3b8' },
  ] as const
})

/** Find the most recent observation on or before `target` ISO date.
 *  FRED publishes weekday-only, so a Saturday target falls back to Friday. */
function valueAt(seriesId: string, target: string): number | null {
  const series = macro.get(seriesId)
  if (!series?.observations.length) return null
  // Observations are date-ascending. Scan from the tail — typical case
  // is "today", which is the very last observation.
  for (let i = series.observations.length - 1; i >= 0; i--) {
    const o = series.observations[i]
    if (o.date <= target) return o.value
  }
  return null
}

const chartEl = ref<HTMLDivElement | null>(null)
const chartHeight = computed(() => (isMobile.value ? 280 : 380))

/** AI context: today's curve at a handful of representative maturities,
 *  plus the y/y change (in bp) at each — gives the LLM enough to describe
 *  parallel shifts vs. shape changes without seeing the full grid. */
useMacroAiContext({
  id: 'yield-curve-snapshot',
  getSnapshot: (): ChartSnapshot | null => {
    const today = new Date().toISOString().slice(0, 10)
    const yearAgo = (() => {
      const d = new Date()
      d.setFullYear(d.getFullYear() - 1)
      return d.toISOString().slice(0, 10)
    })()

    // Sample the curve at points that span the canonical shape: short
    // end, belly, long end. Keeps the metric list short — the analyzer
    // doesn't need 9 rows when 4 carry the same shape info.
    const sampled = MATURITIES.filter((m) =>
      ['DGS3MO', 'DGS2', 'DGS10', 'DGS30'].includes(m.id),
    )
    const metrics = sampled.flatMap((m) => {
      const now = valueAt(m.id, today)
      if (now === null) return []
      const prior = valueAt(m.id, yearAgo)
      const note =
        prior !== null
          ? `${Math.round((now - prior) * 100) > 0 ? '+' : ''}${Math.round((now - prior) * 100)} bp YoY`
          : undefined
      return [{ label: `${m.label} (curve)`, value: now, unit: '%', note }]
    })
    if (metrics.length === 0) return null
    return {
      id: 'yield-curve-snapshot',
      label: 'Yield curve shape',
      description:
        'Yields across maturities (3M / 2Y / 10Y / 30Y) today, with year-over-year change for each — reveals parallel shifts vs. shape changes.',
      asOf: today,
      metrics,
    }
  },
})

useHighcharts(chartEl, () => {
  const ready = MATURITIES.some((m) => macro.get(m.id))
  if (!ready) return null

  const t = getThemeTokens()
  const mobile = isMobile.value

  const hcSeries: Highcharts.SeriesOptionsType[] = anchors.value.map((anchor) => ({
    type: 'spline',
    name: anchor.label,
    color: anchor.color,
    lineWidth: anchor.key === 'today' ? 2.5 : 1.5,
    dashStyle: anchor.key === 'yearAgo' ? 'ShortDash' : 'Solid',
    marker: { enabled: true, radius: 3, lineWidth: 0 },
    data: MATURITIES.map((m) => {
      const v = valueAt(m.id, anchor.date)
      return v === null ? null : [m.years, v]
    }) as ([number, number] | null)[],
  }))

  const options: Highcharts.Options = {
    chart: {
      backgroundColor: 'transparent',
      style: { fontFamily: MONO_FONT },
      spacing: mobile ? [8, 4, 8, 0] : [14, 16, 12, 8],
      animation: false,
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: {
      enabled: true,
      align: 'left',
      itemStyle: {
        color: t.text,
        fontFamily: MONO_FONT,
        fontSize: '11px',
        fontWeight: 'normal',
      },
      itemHoverStyle: { color: t.accent },
      itemHiddenStyle: { color: t.textSoft },
      symbolHeight: 8,
      symbolWidth: 14,
      symbolRadius: 1,
    },
    xAxis: {
      type: 'linear',
      tickPositions: MATURITIES.map((m) => m.years),
      lineColor: t.border,
      tickColor: 'transparent',
      gridLineColor: t.border,
      gridLineDashStyle: 'ShortDash',
      gridLineWidth: 1,
      labels: {
        style: { color: t.textSoft, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
        formatter() {
          const yrs = Number(this.value)
          const m = MATURITIES.find((x) => x.years === yrs)
          return m?.label ?? `${yrs}Y`
        },
      },
      crosshair: { color: t.borderHover, width: 1, dashStyle: 'Solid' },
    },
    yAxis: {
      title: {
        text: mobile ? undefined : 'Yield (%)',
        style: { color: t.textSoft, fontSize: '10px', fontFamily: MONO_FONT },
      },
      gridLineColor: t.border,
      gridLineDashStyle: 'ShortDash',
      labels: {
        style: { color: t.textSoft, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
        formatter() {
          return `${formatNumber(Number(this.value), 1)}%`
        },
      },
    },
    tooltip: {
      shared: true,
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 8,
      shadow: false,
      padding: 8,
      style: { color: t.text, fontFamily: MONO_FONT, fontSize: '12px' },
      useHTML: true,
      formatter() {
        const yrs = Number(this.x)
        const mat = MATURITIES.find((x) => x.years === yrs)
        const rows = (this.points || [])
          .map((p) => {
            const c = (p.series.color as string) || t.text
            const v = `${formatNumber(Number(p.y), 2)}%`
            return (
              `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px">` +
              `<span style="color:${c}">${p.series.name}</span>` +
              `<span style="color:${t.text};font-weight:600">${v}</span>` +
              `</div>`
            )
          })
          .join('')
        return (
          `<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${t.textSoft}">${mat?.label ?? yrs + 'Y'} · Maturity</div>` +
          rows
        )
      },
    },
    plotOptions: {
      spline: {
        states: { hover: { lineWidthPlus: 0 } },
        connectNulls: false,
      },
    },
    series: hcSeries,
  }
  return options
})
</script>

<template>
  <article class="surface p-4 sm:p-6 flex flex-col gap-3 sm:gap-4 relative">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight leading-snug">
            Yield Curve Snapshot
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            3M → 30Y
          </span>
        </div>
        <p class="text-xs text-muted mt-0.5">
          Yield across maturities for three reference dates. Shape changes
          tell the story: parallel shift = level change; pivot = steepening
          or flattening; today's line below year-ago = inversion deepening.
        </p>
      </div>
      <button
        class="flex-shrink-0 w-8 h-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        :title="lastUpdatedRel ? `Refresh (cached ${lastUpdatedRel})` : 'Refresh'"
        :disabled="isLoading"
        @click="loadAll(true)"
      >
        <IconRefreshCw class="size-4" :class="isLoading && 'animate-spin'" />
      </button>
    </header>

    <div class="relative w-full" :style="{ height: `${chartHeight}px` }">
      <div ref="chartEl" class="w-full h-full" />

      <ChartSkeleton
        v-if="isLoading && MATURITIES.every((m) => !macro.get(m.id))"
        label="Loading yield curve"
      />

      <div
        v-else-if="errorMsg && allFailed"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-[var(--tape-surface)]"
      >
        <IconTriangleAlert class="size-5 text-[var(--tape-down)]" />
        <p class="text-sm text-[var(--tape-down)] max-w-md">{{ errorMsg }}</p>
        <button class="btn-outline h-8 px-3 text-xs mt-1" @click="loadAll(true)">
          Retry
        </button>
      </div>
    </div>

    <footer class="text-[10px] text-soft tracking-wide">
      <span v-if="lastUpdatedRel">Cached {{ lastUpdatedRel }}</span>
    </footer>
  </article>
</template>
