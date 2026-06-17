<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type Highcharts from 'highcharts'
import { useMacroStore } from '@/stores/macro'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useHighcharts } from '@/composables/useHighcharts'
import type { MacroRange } from '@/types/macro'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'
import { formatNumber, formatRelative } from '@/utils/format'
import { getThemeTokens, withAlpha, MONO_FONT } from '@/utils/echartsTheme'
import { useMacroAiContext, type ChartSnapshot } from '@/stores/macroAiContext'

/**
 * Three Treasury yields on a shared time axis (single Y axis, units = %).
 * Designed to read "is the curve normal / inverted / flat" from line
 * ordering at a glance — DGS30 highest in a normal regime, DGS2 highest
 * in an inverted regime.
 *
 * DGS30 has a documented gap between 2002-02-18 and 2006-02-09 (Treasury
 * suspended 30Y issuance). The chart simply leaves a hole there; the
 * navigator's range slider stays usable.
 */

interface SeriesSpec {
  id: string
  label: string
  /** Hex/CSS color override. Falls back to theme accent if omitted. */
  color: string
}

const SERIES: SeriesSpec[] = [
  { id: 'DGS2', label: '2-Year', color: '#3b82f6' },
  { id: 'DGS10', label: '10-Year', color: '#10b981' },
  { id: 'DGS30', label: '30-Year', color: '#a855f7' },
]

const RANGES: MacroRange[] = ['1Y', '3Y', '5Y', '10Y', 'ALL']
const START = '2000-01-01'

const macro = useMacroStore()
const { loading, errors } = storeToRefs(macro)
const { isMobile } = useBreakpoint()

const range = ref<MacroRange>('1Y')

function loadAll(force = false): void {
  for (const s of SERIES) {
    void macro.load(s.id, { start: START, force })
  }
}
onMounted(() => loadAll(false))

const seriesData = computed(() =>
  SERIES.map((s) => ({ spec: s, series: macro.get(s.id) })),
)

const isLoading = computed(() => SERIES.some((s) => loading.value[s.id]))
const allFailed = computed(() => SERIES.every((s) => errors.value[s.id]))
const errorMsg = computed(
  () => SERIES.map((s) => errors.value[s.id]).find(Boolean) ?? null,
)

const lastUpdatedRel = computed(() => {
  const t = Math.max(...SERIES.map((s) => macro.fetchedAt(s.id) ?? 0))
  return t ? formatRelative(new Date(t).toISOString()) : null
})

/** Most recent value for each series, used in the chip row above the chart.
 *  null when FRED hasn't shipped a fresh observation for that series yet. */
const latestValues = computed(() =>
  seriesData.value.map(({ spec, series }) => {
    const last = series?.observations.at(-1)
    return {
      ...spec,
      value: last?.value ?? null,
      date: last?.date ?? null,
    }
  }),
)

const initialExtremes = computed<[number, number] | null>(() => {
  const all = seriesData.value.flatMap(({ series }) => series?.observations ?? [])
  if (all.length === 0) return null
  const times = all.map((p) => new Date(p.date).getTime())
  const maxTs = Math.max(...times)
  if (range.value === 'ALL') return [Math.min(...times), maxTs]
  const yrs =
    range.value === '1Y' ? 1
      : range.value === '3Y' ? 3
        : range.value === '5Y' ? 5
          : 10
  return [maxTs - yrs * 365.25 * 86_400_000, maxTs]
})

const chartEl = ref<HTMLDivElement | null>(null)
const chartHeight = computed(() => (isMobile.value ? 280 : 380))

/** AI context: latest yield for each maturity + the 30d delta (in basis
 *  points) so the LLM can speak to "10Y is up 22 bp this month" without
 *  having to scan a time series. Returns null until at least one series
 *  has data. */
function deltaBp(seriesId: string, daysBack: number): number | null {
  const series = macro.get(seriesId)
  if (!series?.observations.length) return null
  const last = series.observations.at(-1)
  if (!last) return null
  // Linear scan from the tail — daysBack is small (≤ 252), series is
  // bounded by START so the cost is negligible.
  const cutoff = new Date(last.date).getTime() - daysBack * 86_400_000
  for (let i = series.observations.length - 1; i >= 0; i--) {
    const o = series.observations[i]
    if (new Date(o.date).getTime() <= cutoff) {
      return Math.round((last.value - o.value) * 100)
    }
  }
  return null
}

useMacroAiContext({
  id: 'treasury-rates',
  getSnapshot: (): ChartSnapshot | null => {
    const latest = latestValues.value.filter((v) => v.value !== null)
    if (latest.length === 0) return null
    const asOf = latest
      .map((v) => v.date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1)
    return {
      id: 'treasury-rates',
      label: 'Treasury yields',
      description:
        'Latest constant-maturity Treasury yields (DGS2/DGS10/DGS30) with 30-day basis-point changes.',
      asOf: asOf ?? undefined,
      metrics: latest.flatMap((v) => {
        const d30 = deltaBp(v.id, 30)
        return [
          {
            label: `${v.label} yield`,
            value: v.value,
            unit: '%',
            note:
              d30 !== null
                ? `${d30 > 0 ? '+' : ''}${d30} bp over 30 days`
                : undefined,
          },
        ]
      }),
    }
  },
})

useHighcharts(
  chartEl,
  () => {
    const data = seriesData.value
    if (data.every((d) => (d.series?.observations.length ?? 0) < 2)) return null

    const t = getThemeTokens()
    const mobile = isMobile.value

    const hcSeries: Highcharts.SeriesOptionsType[] = data.map(({ spec, series }) => ({
      type: 'line',
      name: spec.label,
      color: spec.color,
      data: (series?.observations ?? []).map((p) => [
        new Date(p.date).getTime(),
        p.value,
      ]) as [number, number][],
      showInNavigator: spec.id === 'DGS10',
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
        type: 'datetime',
        lineColor: 'transparent',
        tickColor: 'transparent',
        min: initialExtremes.value?.[0],
        max: initialExtremes.value?.[1],
        labels: {
          style: { color: t.textSoft, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
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
          const ts = Number(this.x)
          const d = new Date(ts).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
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
            `<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${t.textSoft}">${d}</div>` +
            rows
          )
        },
      },
      plotOptions: {
        line: {
          marker: {
            enabled: false,
            states: {
              hover: { enabled: true, radius: 4, lineWidth: 2, lineColor: t.bgElev },
            },
          },
          lineWidth: 1.5,
          // The default Highcharts behavior is to connect across nulls; we
          // want the 2002-2006 30Y gap to render as a real break, not a
          // straight diagonal across four years.
          connectNulls: false,
          states: { hover: { lineWidthPlus: 0 } },
        },
      },
      series: hcSeries,
      navigator: {
        enabled: !mobile,
        height: 36,
        margin: 18,
        maskFill: withAlpha(SERIES[1].color, 0.15),
        maskInside: true,
        outlineColor: t.border,
        outlineWidth: 1,
        series: {
          type: 'areaspline',
          color: SERIES[1].color,
          lineColor: SERIES[1].color,
          lineWidth: 1,
          fillOpacity: 0.18,
        },
        xAxis: {
          gridLineColor: t.border,
          labels: {
            style: { color: t.textSoft, fontSize: '9px', fontFamily: MONO_FONT },
          },
        },
        handles: {
          backgroundColor: t.bgElev,
          borderColor: t.borderHover,
          height: 18,
          width: 8,
        },
      },
      scrollbar: { enabled: false },
      rangeSelector: { enabled: false },
    }
    return options
  },
  { constructor: 'stockChart' },
)
</script>

<template>
  <article class="surface p-4 sm:p-6 flex flex-col gap-3 sm:gap-4 relative">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight leading-snug">
            Treasury Yields
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            DGS2 · DGS10 · DGS30
          </span>
        </div>
        <p class="text-xs text-muted mt-0.5">
          Constant-maturity yields. Line ordering reveals curve shape — 30Y
          on top is a normal regime; 2Y on top is an inversion.
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

    <!-- Latest readings -->
    <div class="grid grid-cols-3 gap-2 sm:gap-3">
      <div
        v-for="entry in latestValues"
        :key="entry.id"
        class="rounded-md border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-3 py-2"
      >
        <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-soft">
          <span
            class="inline-block w-2 h-[2px] rounded-sm"
            :style="{ backgroundColor: entry.color }"
          />
          {{ entry.label }}
        </div>
        <div class="text-mono text-base sm:text-lg font-semibold mt-0.5">
          <template v-if="entry.value !== null">
            {{ formatNumber(entry.value, 2) }}<span class="text-soft text-xs ml-0.5">%</span>
          </template>
          <span v-else class="text-soft text-sm">--</span>
        </div>
        <div v-if="entry.date" class="text-[10px] text-soft text-mono">
          {{ entry.date }}
        </div>
      </div>
    </div>

    <div class="relative w-full" :style="{ height: `${chartHeight}px` }">
      <div ref="chartEl" class="w-full h-full" />

      <ChartSkeleton
        v-if="isLoading && seriesData.every((d) => !d.series)"
        label="Loading Treasury yields"
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

    <footer class="flex items-center justify-between gap-3 flex-wrap">
      <div class="grid grid-cols-5 gap-1 w-full sm:w-auto">
        <button
          v-for="r in RANGES"
          :key="r"
          class="px-2 h-9 sm:h-7 rounded-lg text-[11px] font-medium tracking-wide transition-colors"
          :class="
            range === r
              ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
              : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
          "
          @click="range = r"
        >
          {{ r }}
        </button>
      </div>
      <div class="text-[10px] text-soft tracking-wide">
        <span v-if="lastUpdatedRel">Cached {{ lastUpdatedRel }}</span>
      </div>
    </footer>
  </article>
</template>
