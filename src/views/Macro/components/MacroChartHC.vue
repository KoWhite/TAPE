<script setup lang="ts">
import { computed, ref } from 'vue'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconMinus from '~icons/lucide/minus'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type Highcharts from 'highcharts'
import type {
  MacroPoint,
  MacroRange,
  MacroSeries,
  MacroSeriesConfig,
} from '@/types/macro'
import { formatRelative } from '@/utils/format'
import {
  formatMacroAxis,
  formatMacroDelta,
  formatMacroValue,
  transformMacroPoints,
} from '@/utils/macroFormat'
import { useHighcharts } from '@/composables/useHighcharts'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { getThemeTokens, withAlpha, MONO_FONT } from '@/utils/echartsTheme'
import { useMacroAiContext, type ChartSnapshot } from '@/stores/macroAiContext'

const props = defineProps<{
  series: MacroSeries | null
  config: MacroSeriesConfig
  comparisonSeries?: MacroSeries | null
  comparisonConfig?: MacroSeriesConfig | null
  loading?: boolean
  error?: string | null
  fetchedAt?: number | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const range = ref<MacroRange>(props.config.defaultRange ?? '1Y')
const RANGES: MacroRange[] = ['1Y', '3Y', '5Y', '10Y', 'ALL']
const { isMobile } = useBreakpoint()

const transformed = computed<MacroPoint[]>(() => {
  if (!props.series) return []
  return transformMacroPoints(props.series.observations, props.config.transform)
})

const comparisonPoints = computed<MacroPoint[]>(() => {
  if (!props.comparisonSeries || !props.comparisonConfig) return []
  return transformMacroPoints(props.comparisonSeries.observations, props.comparisonConfig.transform)
})

// The navigator below the chart always shows the full series; `range` only
// drives the initial visible window (xAxis extremes). Manual drags on the
// navigator handles change extremes via Highcharts internals -we don't
// reflect that back into `range`, so the active button stays as last clicked.
const initialExtremes = computed<[number, number] | null>(() => {
  const pts = transformed.value
  if (pts.length === 0) return null
  const maxTs = new Date(pts.at(-1)!.date).getTime()
  if (range.value === 'ALL') {
    return [new Date(pts[0].date).getTime(), maxTs]
  }
  const yrs = range.value === '1Y' ? 1 : range.value === '3Y' ? 3 : range.value === '5Y' ? 5 : 10
  return [maxTs - yrs * 365.25 * 24 * 3600 * 1000, maxTs]
})

// ──────────────────────────────────────────────────────────────────────
// Headline stat
// ──────────────────────────────────────────────────────────────────────
const latest = computed(() => transformed.value.at(-1) ?? null)
const previous = computed(() => transformed.value.at(-2) ?? null)

const direction = computed<'up' | 'down' | 'flat'>(() => {
  if (!latest.value || !previous.value) return 'flat'
  const d = latest.value.value - previous.value.value
  if (Math.abs(d) < 1e-9) return 'flat'
  return d > 0 ? 'up' : 'down'
})

const isFavorable = computed(() => {
  if (direction.value === 'flat') return null
  const good = props.config.positiveIsGood ?? true
  return (direction.value === 'up') === good
})

const headlineColor = computed(() => {
  if (isFavorable.value === null) return 'text-[var(--tape-text-soft)]'
  return isFavorable.value ? 'text-[var(--tape-up)]' : 'text-[var(--tape-down)]'
})

const trendIsFavorable = computed<boolean | null>(() => {
  if (transformed.value.length < 2) return null
  const first = transformed.value[0].value
  const last = transformed.value.at(-1)!.value
  const rising = last >= first
  const good = props.config.positiveIsGood ?? true
  return rising === good
})

// ──────────────────────────────────────────────────────────────────────
// Value formatting — thin wrappers binding this card's config; shared
// implementations live in @/utils/macroFormat.
// ──────────────────────────────────────────────────────────────────────
const formatValue = (v: number): string => formatMacroValue(v, props.config)
const formatDelta = (v: number): string => formatMacroDelta(v, props.config)
const formatAxis = (v: number): string => formatMacroAxis(v, props.config)

const changeFromPrev = computed(() => {
  if (!latest.value || !previous.value) return null
  return latest.value.value - previous.value.value
})

/** AI context registration. One entry per MacroChartHC instance; the id
 *  is the FRED series id so multiple cards on one page register cleanly.
 *  The metric carries the *post-transform* value (e.g. CPI YoY %, not the
 *  raw level) so the LLM sees what the chart actually plots. */
function aiUnit(): string {
  const fmt = props.config.format
  if (fmt === 'percent_signed' || fmt === 'percent' || fmt === 'percent_point') return '%'
  if (fmt === 'thousands_signed') return 'K'
  return ''
}

function aiNote(): string | undefined {
  if (changeFromPrev.value === null) return undefined
  const v = changeFromPrev.value
  if (props.config.format === 'percent_signed' || props.config.format === 'percent') {
    const pp = (v * 100).toFixed(2)
    return `${v > 0 ? '+' : ''}${pp} pp vs prior period`
  }
  if (props.config.format === 'percent_point') {
    return `${v > 0 ? '+' : ''}${v.toFixed(props.config.digits ?? 1)} pp vs prior period`
  }
  return `${v > 0 ? '+' : ''}${Math.round(v)} vs prior period`
}

useMacroAiContext({
  id: `macro-chart:${props.config.id}`,
  getSnapshot: (): ChartSnapshot | null => {
    const last = latest.value
    if (!last) return null
    // Post-transform value, post-transform unit — keep them aligned.
    const value =
      props.config.format === 'percent_signed' || props.config.format === 'percent'
        ? last.value * 100
        : props.config.format === 'thousands_signed'
          ? last.value / 1000
          : last.value // 'percent_point' is already in %, 'number' as-is
    return {
      id: `macro-chart:${props.config.id}`,
      label: props.config.label,
      description: props.config.description ?? props.config.label,
      asOf: last.date,
      metrics: [
        {
          label: props.config.label,
          value,
          unit: aiUnit(),
          note: aiNote(),
        },
      ],
    }
  },
})

const headlineSign = computed(() => {
  if (direction.value === 'flat') return IconMinus
  return direction.value === 'up' ? IconTrendingUp : IconTrendingDown
})

// ──────────────────────────────────────────────────────────────────────
// Highcharts
// ──────────────────────────────────────────────────────────────────────

/**
 * Build a 2-point scatter overlay marking the all-time high and the latest
 * observation. Each marker carries its own dataLabel so the values stay
 * pinned to the chart even when the user pans/zooms the navigator.
 *
 * Edge case: if "now" *is* the peak, the two points coincide -we collapse
 * them into one combined "Peak · Now" label so they don't overdraw.
 */
function extremesSeries(
  data: [number, number][],
  t: ReturnType<typeof getThemeTokens>,
  lineCol: string,
  showLabels: boolean,
): Highcharts.SeriesScatterOptions {
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

  const points: Highcharts.PointOptionsObject[] = sameDate
    ? [
        {
          x: last[0],
          y: last[1],
          color: t.up,
          marker: { radius: 5, lineWidth: 2, lineColor: t.bgElev, fillColor: t.up },
          dataLabels: {
            enabled: showLabels,
            format: `Peak · Now ${formatValue(last[1])}`,
            align: 'right',
            verticalAlign: 'bottom',
            x: -8,
            y: -10,
            style: {
              color: t.up,
              fontFamily: MONO_FONT,
              fontSize: '10px',
              fontWeight: '600',
              textOutline: `2px ${t.surface}`,
            },
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
            enabled: showLabels,
            format: `Peak ${formatValue(peak[1])} · ${fmtDate(peak[0])}`,
            align: 'center',
            verticalAlign: 'bottom',
            y: -10,
            style: {
              color: t.up,
              fontFamily: MONO_FONT,
              fontSize: '10px',
              fontWeight: '600',
              textOutline: `2px ${t.surface}`,
            },
          },
        },
        {
          x: last[0],
          y: last[1],
          color: lineCol,
          marker: { radius: 4, lineWidth: 2, lineColor: t.bgElev, fillColor: lineCol },
          dataLabels: {
            enabled: showLabels,
            format: `Now ${formatValue(last[1])}`,
            align: 'right',
            verticalAlign: 'middle',
            x: -8,
            style: {
              color: lineCol,
              fontFamily: MONO_FONT,
              fontSize: '10px',
              fontWeight: '600',
              textOutline: `2px ${t.surface}`,
            },
          },
        },
      ]

  return {
    type: 'scatter',
    name: 'Extremes',
    data: points,
    enableMouseTracking: false,
    showInLegend: false,
    showInNavigator: false,
    zIndex: 5,
  }
}

const chartEl = ref<HTMLDivElement | null>(null)
const chartHeight = computed(() => (isMobile.value ? 278 : 360))

const showZeroLine = computed(
  () => props.config.format === 'percent_signed' || props.config.transform === 'mom',
)

useHighcharts(chartEl, () => {
  const pts = transformed.value
  if (pts.length < 2) return null

  const t = getThemeTokens()
  const mobile = isMobile.value
  const lineCol =
    trendIsFavorable.value === null
      ? t.accent
      : trendIsFavorable.value
        ? t.up
        : t.down
  const plotBands = (props.config.bands ?? []).map((band) => {
    const toneColor =
      band.tone === 'up'
        ? t.up
        : band.tone === 'down'
          ? t.down
          : band.tone === 'warn'
            ? '#d97706'
            : t.accent
    return {
      from: band.from,
      to: band.to,
      color: withAlpha(toneColor, 0.055),
      label: {
        text: mobile ? undefined : band.label,
        align: 'right' as const,
        x: -8,
        style: {
          color: withAlpha(toneColor, 0.78),
          fontSize: '9px',
          fontFamily: MONO_FONT,
          textOutline: 'none',
        },
      },
    }
  })

  const data: [number, number][] = pts.map((p) => [
    new Date(p.date).getTime(),
    p.value,
  ])
  const comparisonData: [number, number][] = comparisonPoints.value.map((p) => [
    new Date(p.date).getTime(),
    p.value,
  ])
  const hasComparison = Boolean(props.comparisonConfig && comparisonData.length > 1)
  const comparisonCol = t.accent

  const ext = initialExtremes.value

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
      enabled: hasComparison,
      itemStyle: { color: t.textSoft, fontSize: '11px', fontFamily: MONO_FONT },
      itemHoverStyle: { color: t.text },
      itemHiddenStyle: { color: t.textSoft },
      align: 'left',
      verticalAlign: 'top',
      floating: !mobile,
      x: mobile ? 0 : 8,
      y: mobile ? 0 : 2,
    },
    xAxis: {
      type: 'datetime',
      lineColor: 'transparent',
      tickColor: 'transparent',
      min: ext?.[0],
      max: ext?.[1],
      labels: {
        style: {
          color: t.textSoft,
          fontSize: mobile ? '9px' : '10px',
          fontFamily: MONO_FONT,
        },
      },
      crosshair: {
        color: t.borderHover,
        width: 1,
        dashStyle: 'Solid',
      },
    },
    yAxis: [
      {
        title: { text: undefined },
        gridLineColor: t.border,
        gridLineDashStyle: 'ShortDash',
        tickAmount: mobile ? 4 : undefined,
        labels: {
          style: {
            color: t.textSoft,
            fontSize: mobile ? '9px' : '10px',
            fontFamily: MONO_FONT,
          },
          formatter() {
            return formatAxis(Number(this.value))
          },
        },
        plotLines: showZeroLine.value
          ? [
              {
                value: 0,
                color: t.borderHover,
                width: 1,
                zIndex: 3,
              },
            ]
          : [],
        plotBands,
      },
      ...(hasComparison && props.comparisonConfig
        ? [
            {
              title: { text: undefined },
              opposite: true,
              gridLineWidth: 0,
              labels: {
                style: {
                  color: comparisonCol,
                  fontSize: mobile ? '9px' : '10px',
                  fontFamily: MONO_FONT,
                },
                formatter(this: Highcharts.AxisLabelsFormatterContextObject): string {
                  return formatMacroAxis(Number(this.value), props.comparisonConfig!)
                },
              },
            },
          ]
        : []),
    ],
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 8,
      shadow: false,
      padding: 8,
      style: {
        color: t.text,
        fontFamily: MONO_FONT,
        fontSize: '12px',
      },
      useHTML: true,
      shared: true,
      formatter() {
        const ts = Number(this.x)
        const d = new Date(ts).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        const points = this.points ?? [this]
        const rows = points.map((p) => {
          const value = Number(p.y)
          const name = p.series.name
          const formatted = props.comparisonConfig && name === props.comparisonConfig.label
            ? formatMacroValue(value, props.comparisonConfig)
            : formatValue(value)
          const color = String(p.color || p.series.color || t.text)
          return `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:3px"><span style="color:${color}">${name}</span><span style="color:${t.text};font-weight:600">${formatted}</span></div>`
        })
        return `<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${t.textSoft};margin-bottom:4px">${d}</div>${rows.join('')}`
      },
    },
    plotOptions: {
      area: {
        marker: {
          enabled: false,
          states: {
            hover: { enabled: true, radius: 4, lineWidth: 2, lineColor: t.bgElev },
          },
        },
        lineWidth: 1.75,
        states: { hover: { lineWidthPlus: 0 } },
      },
      line: {
        marker: { enabled: false },
        lineWidth: 1.6,
        states: { hover: { lineWidthPlus: 0 } },
      },
    },
    series: [
      {
        type: 'area',
        name: props.config.label,
        data,
        color: lineCol,
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, withAlpha(lineCol, 0.28)],
            [1, withAlpha(lineCol, 0)],
          ],
        },
      },
      ...(hasComparison && props.comparisonConfig
        ? [
            {
              type: 'line' as const,
              name: props.comparisonConfig.label,
              data: comparisonData,
              yAxis: 1,
              color: comparisonCol,
              dashStyle: 'ShortDash' as const,
              zIndex: 4,
            },
          ]
        : []),
      ...(props.config.showExtremes ? [extremesSeries(data, t, lineCol, !mobile)] : []),
    ],
    navigator: {
      enabled: !mobile,
      height: 36,
      margin: 18,
      maskFill: withAlpha(lineCol, 0.15),
      maskInside: true,
      outlineColor: t.border,
      outlineWidth: 1,
      series: {
        type: 'areaspline',
        color: lineCol,
        lineColor: lineCol,
        lineWidth: 1,
        fillOpacity: 0.18,
      },
      xAxis: {
        gridLineColor: t.border,
        labels: {
          style: {
            color: t.textSoft,
            fontSize: '9px',
            fontFamily: MONO_FONT,
          },
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

const lastUpdatedRel = computed(() => {
  if (!props.fetchedAt) return null
  return formatRelative(new Date(props.fetchedAt).toISOString())
})

const fredPubRel = computed(() => {
  const ts = props.series?.lastUpdated
  if (!ts) return null
  const t = new Date(ts.replace(' ', 'T'))
  if (Number.isNaN(t.getTime())) return null
  return formatRelative(t.toISOString())
})

function detailToneClass(tone?: string): string {
  if (tone === 'up') return 'text-[var(--tape-up)]'
  if (tone === 'down') return 'text-[var(--tape-down)]'
  if (tone === 'warn') return 'text-[var(--tape-warn)]'
  return 'text-[var(--tape-text)]'
}
</script>

<template>
  <article class="surface p-4 sm:p-6 flex flex-col gap-3 sm:gap-4 relative">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight leading-snug">
            {{ config.label }}
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ config.id }} · {{ series?.frequencyShort || series?.frequency || '--' }}
          </span>
          <span class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--tape-surface-hover-bg)] text-soft">
            HC
          </span>
        </div>
        <p v-if="config.description" class="text-xs text-muted mt-0.5">
          {{ config.description }}
        </p>
      </div>
      <button
        class="flex-shrink-0 w-8 h-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        :title="lastUpdatedRel ? `Refresh (cached ${lastUpdatedRel})` : 'Refresh'"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <IconRefreshCw class="size-4" :class="loading && 'animate-spin'" />
      </button>
    </header>

    <div class="flex items-end justify-between gap-3 sm:gap-4 flex-wrap">
      <div class="flex flex-col">
        <span class="text-[10px] uppercase tracking-wider text-soft">
          Latest · {{ latest ? new Date(latest.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '--' }}
        </span>
        <span
          class="text-mono text-2xl sm:text-4xl font-semibold tracking-tight mt-1 break-all"
          :class="headlineColor"
        >
          {{ latest ? formatValue(latest.value) : '--' }}
        </span>
      </div>
      <div v-if="changeFromPrev !== null" class="flex flex-col items-end gap-1.5">
        <span class="text-[10px] uppercase tracking-wider text-soft">vs prev</span>
        <span
          class="pill"
          :class="
            isFavorable === null
              ? 'pill-flat'
              : isFavorable
              ? 'pill-up'
              : 'pill-down'
          "
        >
          <component :is="headlineSign" class="size-3" />
          {{ formatDelta(changeFromPrev) }}
        </span>
      </div>
    </div>

    <div class="relative w-full" :style="{ height: `${chartHeight}px` }">
      <div ref="chartEl" class="w-full h-full" />

      <div v-if="loading && !series" class="absolute inset-0 skeleton rounded-xl" />

      <div
        v-else-if="error && !series"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-[var(--tape-surface)]"
      >
        <IconTriangleAlert class="size-5 text-[var(--tape-down)]" />
        <p class="text-sm text-[var(--tape-down)] max-w-md">{{ error }}</p>
        <button class="btn-outline h-8 px-3 text-xs mt-1" @click="emit('refresh')">Retry</button>
      </div>

      <div
        v-else-if="transformed.length < 2"
        class="absolute inset-0 flex-center text-sm text-soft bg-[var(--tape-surface)]"
      >
        Insufficient data for this range
      </div>
    </div>

    <div
      v-if="series?.details?.length"
      class="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-2"
    >
      <div
        v-for="detail in series.details"
        :key="detail.label"
        class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-bg-elev)] px-3 py-2 min-w-0"
        :title="detail.description"
      >
        <div class="text-[10px] uppercase tracking-wider text-soft truncate">
          {{ detail.label }}
        </div>
        <div class="text-mono text-sm font-semibold tabular-nums truncate mt-0.5" :class="detailToneClass(detail.tone)">
          {{ detail.value }}
        </div>
        <div v-if="detail.description" class="text-[10px] text-muted truncate mt-0.5">
          {{ detail.description }}
        </div>
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
        <span v-if="fredPubRel">FRED revised {{ fredPubRel }}</span>
        <span v-if="fredPubRel && lastUpdatedRel" class="mx-1.5">·</span>
        <span v-if="lastUpdatedRel">Cached {{ lastUpdatedRel }}</span>
      </div>
    </footer>
  </article>
</template>
