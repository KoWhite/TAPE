<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type Highcharts from 'highcharts'
import type { MacroPoint, MacroRange, MacroSeriesConfig } from '@/types/macro'
import { formatNumber, formatRelative } from '@/utils/format'
import { useMacroStore } from '@/stores/macro'
import { useHighcharts } from '@/composables/useHighcharts'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { getThemeTokens, withAlpha, MONO_FONT } from '@/utils/echartsTheme'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'
import { useMacroAiContext, type ChartSnapshot } from '@/stores/macroAiContext'

/**
 * Two FRED series on the same time axis with independent Y axes -designed
 * for "is X correlated with Y" views, e.g. VIX vs S&P 500. Loads both
 * series through the macro store and lets the user retry/refresh together.
 */
const props = defineProps<{
  title: string
  description?: string
  primary: MacroSeriesConfig
  secondary: MacroSeriesConfig
  /** Override the default token colors. */
  primaryColor?: string
  secondaryColor?: string
  /** Render the primary series as a filled gradient area (drawn behind the
   *  secondary line). Useful when you want one series to read as "background
   *  context" and the other as "foreground signal". */
  primaryStyle?: 'line' | 'area'
}>()

const macro = useMacroStore()
const { loading, errors } = storeToRefs(macro)

const range = ref<MacroRange>('1Y')
const RANGES: MacroRange[] = ['1Y', '3Y', '5Y', '10Y', 'ALL']
const { isMobile } = useBreakpoint()

function loadAll(force = false): void {
  void macro.load(props.primary.id, { start: props.primary.start, force })
  void macro.load(props.secondary.id, { start: props.secondary.start, force })
}
onMounted(() => loadAll(false))

const isLoading = computed(
  () => loading.value[props.primary.id] || loading.value[props.secondary.id],
)
const errorMsg = computed(() => {
  return errors.value[props.primary.id] || errors.value[props.secondary.id] || null
})

const primarySeries = computed(() => macro.get(props.primary.id))
const secondarySeries = computed(() => macro.get(props.secondary.id))

// Pass the full series to Highcharts; the navigator handles zoom/pan, and
// `range` only seeds the initial xAxis window via `initialExtremes`.
const primaryPts = computed(() => primarySeries.value?.observations ?? [])
const secondaryPts = computed(() => secondarySeries.value?.observations ?? [])

const initialExtremes = computed<[number, number] | null>(() => {
  const all: MacroPoint[] = [...primaryPts.value, ...secondaryPts.value]
  if (all.length === 0) return null
  const times = all.map((p) => new Date(p.date).getTime())
  const maxTs = Math.max(...times)
  if (range.value === 'ALL') {
    return [Math.min(...times), maxTs]
  }
  const yrs = range.value === '1Y' ? 1 : range.value === '3Y' ? 3 : range.value === '5Y' ? 5 : 10
  return [maxTs - yrs * 365.25 * 24 * 3600 * 1000, maxTs]
})

const lastUpdatedRel = computed(() => {
  const t = Math.max(
    macro.fetchedAt(props.primary.id) ?? 0,
    macro.fetchedAt(props.secondary.id) ?? 0,
  )
  return t ? formatRelative(new Date(t).toISOString()) : null
})

/** AI context: report each series' current level + 30-day change. Dual
 *  charts are typically correlation views (VIX vs S&P 500, M2 vs S&P
 *  500), so emitting both halves lets the analyzer reason about the pair. */
function deltaOver(seriesId: string, daysBack: number): number | null {
  const series = macro.get(seriesId)
  if (!series?.observations.length) return null
  const last = series.observations.at(-1)
  if (!last) return null
  const cutoff = new Date(last.date).getTime() - daysBack * 86_400_000
  for (let i = series.observations.length - 1; i >= 0; i--) {
    const o = series.observations[i]
    if (new Date(o.date).getTime() <= cutoff) return last.value - o.value
  }
  return null
}

useMacroAiContext({
  id: `macro-dual:${props.primary.id}:${props.secondary.id}`,
  getSnapshot: (): ChartSnapshot | null => {
    const a = primarySeries.value?.observations.at(-1)
    const b = secondarySeries.value?.observations.at(-1)
    if (!a && !b) return null
    const metrics: ChartSnapshot['metrics'] = []
    for (const [series, label, point] of [
      [props.primary, props.primary.label, a],
      [props.secondary, props.secondary.label, b],
    ] as const) {
      if (!point) continue
      const d30 = deltaOver(series.id, 30)
      const note =
        d30 !== null
          ? `${d30 > 0 ? '+' : ''}${Number(d30.toFixed(2))} vs 30d ago`
          : undefined
      metrics.push({ label, value: point.value, unit: '', note })
    }
    if (metrics.length === 0) return null
    const asOf = [a?.date, b?.date]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1)
    return {
      id: `macro-dual:${props.primary.id}:${props.secondary.id}`,
      label: props.title,
      description: props.description ?? props.title,
      asOf,
      metrics,
    }
  },
})

// ──────────────────────────────────────────────────────────────────────
// Chart
// ──────────────────────────────────────────────────────────────────────
const chartEl = ref<HTMLDivElement | null>(null)
const chartHeight = computed(() => (isMobile.value ? 300 : 400))

useHighcharts(chartEl, () => {
  const aPts = primaryPts.value
  const bPts = secondaryPts.value
  if (aPts.length < 2 && bPts.length < 2) return null

  const t = getThemeTokens()
  const mobile = isMobile.value
  const primaryCol = props.primaryColor ?? t.down
  const secondaryCol = props.secondaryColor ?? t.accent

  const aData: [number, number][] = aPts.map((p) => [
    new Date(p.date).getTime(),
    p.value,
  ])
  const bData: [number, number][] = bPts.map((p) => [
    new Date(p.date).getTime(),
    p.value,
  ])

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
    yAxis: [
      {
        // Left axis -primary
        title: {
          text: mobile ? undefined : props.primary.label,
          style: { color: primaryCol, fontSize: '10px', fontFamily: MONO_FONT },
        },
        gridLineColor: t.border,
        gridLineDashStyle: 'ShortDash',
        tickAmount: mobile ? 4 : undefined,
        labels: {
          style: { color: primaryCol, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
          formatter() {
            return formatNumber(Number(this.value), 0)
          },
        },
      },
      {
        // Right axis -secondary
        title: {
          text: mobile ? undefined : props.secondary.label,
          style: { color: secondaryCol, fontSize: '10px', fontFamily: MONO_FONT },
        },
        gridLineWidth: 0,
        opposite: true,
        labels: {
          style: { color: secondaryCol, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
          formatter() {
            return formatNumber(Number(this.value), 0)
          },
        },
      },
    ],
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
            const v = formatNumber(Number(p.y), 2)
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
        states: { hover: { lineWidthPlus: 0 } },
      },
      area: {
        marker: {
          enabled: false,
          states: {
            hover: { enabled: true, radius: 4, lineWidth: 2, lineColor: t.bgElev },
          },
        },
        lineWidth: 1.5,
        states: { hover: { lineWidthPlus: 0 } },
      },
    },
    series: [
      {
        type: props.primaryStyle === 'area' ? 'area' : 'line',
        name: props.primary.label,
        yAxis: 0,
        data: aData,
        color: primaryCol,
        showInNavigator: true,
        ...(props.primaryStyle === 'area' && {
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, withAlpha(primaryCol, 0.45)],
              [1, withAlpha(primaryCol, 0.02)],
            ],
          },
          // Sit behind the secondary line so the gradient reads as
          // background context.
          zIndex: 0,
        }),
      },
      {
        type: 'line',
        name: props.secondary.label,
        yAxis: 1,
        data: bData,
        color: secondaryCol,
        showInNavigator: false,
        zIndex: 1,
      },
    ],
    navigator: {
      enabled: !mobile,
      height: 36,
      margin: 18,
      maskFill: withAlpha(primaryCol, 0.15),
      maskInside: true,
      outlineColor: t.border,
      outlineWidth: 1,
      series: {
        type: 'areaspline',
        color: primaryCol,
        lineColor: primaryCol,
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
}, { constructor: 'stockChart' })
</script>

<template>
  <article class="surface p-4 sm:p-6 flex flex-col gap-3 sm:gap-4 relative">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight leading-snug">
            {{ title }}
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ primary.id }} + {{ secondary.id }}
          </span>
          <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--tape-surface-hover-bg)] text-soft">
            HC
          </span>
        </div>
        <p v-if="description" class="text-xs text-muted mt-0.5">
          {{ description }}
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
        v-if="isLoading && !primarySeries && !secondarySeries"
        label="Loading macro chart"
      />

      <div
        v-else-if="errorMsg && !primarySeries && !secondarySeries"
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
