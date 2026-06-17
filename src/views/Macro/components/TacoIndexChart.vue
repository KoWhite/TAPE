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
import { getThemeTokens, MONO_FONT, withAlpha } from '@/utils/echartsTheme'
import { useMacroAiContext, type ChartSnapshot } from '@/stores/macroAiContext'
import type { TacoComponentPoint } from '@/types/macro'

type TacoKey = keyof TacoComponentPoint

type TacoUnit = '%' | 'pp' | 'pts'

interface ComponentSpec {
  key: TacoKey
  label: string
  color: string
  unit: TacoUnit
}

// Unit comes from backend componentsMeta but we mirror it here so the
// fallback (when meta is absent) doesn't render the wrong suffix.
// Contributions are scaled index points ('pts') — see backend taco.py.
const COMPONENTS: ComponentSpec[] = [
  { key: 'approval', label: 'Net Approval', color: '#bba37a', unit: 'pts' },
  { key: 'sp500', label: 'S&P 500', color: '#7cb89a', unit: 'pts' },
  { key: 'ust10y', label: '10Y UST', color: '#e57373', unit: 'pts' },
  { key: 'inflation', label: '5Y INF', color: '#9aa0d4', unit: 'pts' },
  { key: 'brent', label: 'Brent', color: '#c39bd3', unit: 'pts' },
]

const WINDOW_DAYS = 20

const macro = useMacroStore()
const { taco, tacoLoading, tacoError, tacoFetchedAt } = storeToRefs(macro)
const { isMobile } = useBreakpoint()

const chartEl = ref<HTMLDivElement | null>(null)
const chartHeight = computed(() => (isMobile.value ? 460 : 560))

function load(force = false): void {
  void macro.loadTaco(WINDOW_DAYS, { force })
}

onMounted(() => load(false))

const hasData = computed(() => (taco.value?.series.length ?? 0) > 0)
const latestComponents = computed(() => taco.value?.componentsLatest ?? null)
const latestTotal = computed(() => taco.value?.total ?? null)
const pressureLabel = computed(() => {
  const value = latestTotal.value
  const bands = taco.value?.thresholds ?? []
  if (value === null) return null
  return bands.find((band) => value >= band.min)?.label ?? null
})

const lastUpdatedRel = computed(() =>
  tacoFetchedAt.value ? formatRelative(new Date(tacoFetchedAt.value).toISOString()) : null,
)

const headerTone = computed(() => {
  const v = latestTotal.value ?? 0
  if (v >= 3) return 'text-[var(--tape-down)]'
  if (v <= -3) return 'text-[var(--tape-up)]'
  return 'text-[var(--tape-text)]'
})

function signedPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, digits)}%`
}

function signedUnit(
  value: number | null | undefined,
  unit: TacoUnit,
  digits = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  const sign = value > 0 ? '+' : ''
  const suffix = unit === 'pp' ? 'pp' : unit === 'pts' ? '' : '%'
  return `${sign}${formatNumber(value, digits)}${suffix}`
}

// Resolve a component's unit from the backend meta, falling back to the
// hard-coded spec. This way if meta is absent (older payload, source
// status fallback) we still render the right suffix.
function componentUnit(key: TacoKey): TacoUnit {
  const meta = taco.value?.componentsMeta?.find((m) => m.key === key)
  if (meta?.unit) return meta.unit
  return COMPONENTS.find((c) => c.key === key)?.unit ?? 'pts'
}

const sourceStatus = computed(() => taco.value?.sourceStatus ?? {})
const failedSources = computed(() =>
  COMPONENTS
    .filter((c) => sourceStatus.value[c.key])
    .map((c) => ({ key: c.key, label: c.label, reason: sourceStatus.value[c.key]! })),
)

function dateMs(date: string): number {
  return new Date(`${date}T00:00:00`).getTime()
}

function plotBands(): Highcharts.YAxisPlotBandsOptions[] {
  const thresholds = taco.value?.thresholds ?? []
  if (thresholds.length === 0) return []
  const asc = [...thresholds].sort((a, b) => a.min - b.min)
  return asc.map((band, index) => ({
    from: band.min,
    to: asc[index + 1]?.min ?? 999,
    color: band.color,
    label: {
      text: band.label,
      align: 'right',
      x: isMobile.value ? -2 : -8,
      style: {
        color: getThemeTokens().textSoft,
        fontFamily: MONO_FONT,
        fontSize: isMobile.value ? '9px' : '10px',
        fontWeight: '600',
      },
    },
  }))
}

function pointFor(component: TacoKey): [number, number | null][] {
  return (taco.value?.series ?? []).map((p) => [
    dateMs(p.date),
    p.components[component] ?? null,
  ])
}

useMacroAiContext({
  id: 'taco-index',
  getSnapshot: (): ChartSnapshot | null => {
    if (!taco.value || !latestComponents.value) return null
    return {
      id: 'taco-index',
      label: 'TACO pressure index',
      description:
        'Composite Trump pressure index from market components. Positive values indicate rising pressure.',
      asOf: taco.value.asOf,
      metrics: [
        {
          label: 'TACO total',
          value: taco.value.total,
          unit: '%',
          note: `${taco.value.window}-trading-day contribution sum`,
        },
        ...COMPONENTS.map((c) => ({
          label: c.label,
          value: latestComponents.value?.[c.key] ?? null,
          unit: '%',
        })),
      ],
    }
  },
})

useHighcharts(
  chartEl,
  () => {
    if (!taco.value?.series.length) return null
    const t = getThemeTokens()
    const mobile = isMobile.value

    const componentSeries: Highcharts.SeriesOptionsType[] = COMPONENTS.map((component) => ({
      type: 'column',
      name: component.label,
      color: withAlpha(component.color, 0.72),
      data: pointFor(component.key),
      borderWidth: 0,
      stacking: 'normal',
      pointPadding: 0.03,
      groupPadding: 0.02,
      states: { inactive: { opacity: 0.55 } },
    }))

    const totalSeries: Highcharts.SeriesOptionsType = {
      type: 'line',
      name: 'TACO Total',
      color: t.text,
      data: taco.value.series.map((p) => [dateMs(p.date), p.total]),
      lineWidth: mobile ? 2 : 2.6,
      marker: {
        enabled: false,
        states: {
          hover: {
            enabled: true,
            radius: 4,
            lineColor: t.surface,
            lineWidth: 2,
          },
        },
      },
      zIndex: 6,
      showInNavigator: true,
    }

    const eventLines: Highcharts.XAxisPlotLinesOptions[] = taco.value.events.map((event) => ({
      value: dateMs(event.date),
      color: t.borderHover,
      width: 1,
      dashStyle: 'ShortDot',
      zIndex: 2,
      label: {
        text: event.label,
        rotation: 0,
        y: mobile ? 12 : 16,
        align: 'center',
        style: {
          color: event.tone === 'red' ? t.down : t.textSoft,
          fontFamily: MONO_FONT,
          fontSize: mobile ? '8px' : '10px',
          fontWeight: '600',
          textOutline: 'none',
        },
      },
    }))

    const options: Highcharts.Options = {
      chart: {
        backgroundColor: 'transparent',
        style: { fontFamily: MONO_FONT },
        spacing: mobile ? [8, 2, 8, 0] : [14, 18, 12, 4],
        animation: false,
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: {
        enabled: true,
        align: 'left',
        verticalAlign: 'top',
        itemStyle: {
          color: t.text,
          fontFamily: MONO_FONT,
          fontSize: mobile ? '9px' : '11px',
          fontWeight: 'normal',
        },
        itemHoverStyle: { color: t.accent },
        itemHiddenStyle: { color: t.textSoft },
        symbolHeight: 8,
        symbolWidth: 12,
        symbolRadius: 1,
      },
      xAxis: {
        type: 'datetime',
        lineColor: 'transparent',
        tickColor: 'transparent',
        plotLines: eventLines,
        labels: {
          style: { color: t.textSoft, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
        },
        crosshair: { color: t.borderHover, width: 1 },
      },
      yAxis: {
        title: {
          text: mobile ? undefined : 'Contribution (%)',
          style: { color: t.textSoft, fontSize: '10px', fontFamily: MONO_FONT },
        },
        gridLineColor: withAlpha(t.border, 0.65),
        gridLineDashStyle: 'ShortDash',
        plotBands: plotBands(),
        labels: {
          style: { color: t.textSoft, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
          formatter() {
            return signedPercent(Number(this.value), 0)
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
        padding: 9,
        useHTML: true,
        style: { color: t.text, fontFamily: MONO_FONT, fontSize: '12px' },
        formatter() {
          const ts = Number(this.x)
          const d = new Date(ts).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
          const rows = (this.points || [])
            .slice()
            .sort((a, b) => (a.series.type === 'line' ? -1 : b.series.type === 'line' ? 1 : 0))
            .map((p) => {
              const color = (p.series.color as string) || t.text
              const y = typeof p.y === 'number' ? p.y : null
              const isLine = p.series.type === 'line'
              // The line is the unitless TACO total (just %). Component
              // bars carry their own unit (% for returns, pp for level
              // diffs) so the tooltip is honest about what's being shown.
              const componentKey = isLine
                ? null
                : (COMPONENTS.find((spec) => spec.label === p.series.name)?.key ?? null)
              const v = isLine
                ? signedPercent(y, 2)
                : signedUnit(y, componentKey ? componentUnit(componentKey) : '%', 2)
              const weight = isLine ? 700 : 500
              return (
                `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:3px">` +
                `<span style="color:${color}">${p.series.name}</span>` +
                `<span style="color:${t.text};font-weight:${weight}">${v}</span>` +
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
        column: {
          stacking: 'normal',
          borderWidth: 0,
          crisp: false,
        },
        line: {
          states: { hover: { lineWidthPlus: 0 } },
        },
        series: {
          animation: false,
          turboThreshold: 0,
        },
      },
      series: [...componentSeries, totalSeries],
      navigator: {
        enabled: !mobile,
        height: 34,
        margin: 16,
        maskFill: withAlpha(t.accent, 0.12),
        outlineColor: t.border,
        outlineWidth: 1,
        series: {
          type: 'line',
          color: t.text,
          lineColor: t.text,
          lineWidth: 1,
        },
        xAxis: {
          gridLineColor: t.border,
          labels: { style: { color: t.textSoft, fontSize: '9px', fontFamily: MONO_FONT } },
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
  <article class="surface p-4 sm:p-6 flex flex-col gap-4 sm:gap-5 relative overflow-hidden">
    <header class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="text-[10px] uppercase tracking-[0.28em] text-soft font-semibold">
          Trump Pressure Index
        </div>
        <h3 class="text-xl sm:text-2xl font-semibold tracking-tight leading-tight mt-1">
          Trump Pressure Index <span class="text-soft">TACO</span>
        </h3>
        <p class="text-xs text-muted mt-1 max-w-3xl">
          A {{ WINDOW_DAYS }}-trading-day contribution sum across net approval,
          the S&P 500, 10Y Treasury yields, inflation expectations, and Brent oil.
          Positive readings indicate rising pressure.
        </p>
      </div>

      <div class="shrink-0 flex items-start gap-2">
        <div class="text-right">
          <div class="inline-flex items-center rounded-md bg-[var(--tape-button-bg)] px-2 py-1 text-[10px] text-soft">
            {{ pressureLabel ?? 'Pressure' }}
          </div>
          <div class="text-mono text-3xl sm:text-4xl font-semibold leading-none mt-1" :class="headerTone">
            {{ signedPercent(latestTotal, 1) }}
          </div>
          <div class="text-[10px] text-soft mt-1">
            vs. {{ WINDOW_DAYS }} trading days ago
          </div>
        </div>
        <button
          class="w-8 h-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
          :title="lastUpdatedRel ? `Refresh (cached ${lastUpdatedRel})` : 'Refresh'"
          :disabled="tacoLoading"
          @click="load(true)"
        >
          <IconRefreshCw class="size-4" :class="tacoLoading && 'animate-spin'" />
        </button>
      </div>
    </header>

    <div class="flex flex-col gap-2">
      <div class="grid grid-cols-5 gap-1 w-full">
        <div
          v-for="component in COMPONENTS"
          :key="component.key"
          class="min-w-0 rounded-md border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-2.5 py-2"
          :class="sourceStatus[component.key] ? 'opacity-50' : ''"
          :title="sourceStatus[component.key] || ''"
        >
          <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-soft">
            <span class="inline-block w-2 h-[2px] rounded-sm" :style="{ backgroundColor: component.color }" />
            <span class="truncate">{{ component.label }}</span>
          </div>
          <div class="text-mono text-sm font-semibold mt-0.5">
            <template v-if="sourceStatus[component.key]">
              <span class="text-[var(--tape-down)] text-xs">unavail</span>
            </template>
            <template v-else>
              {{ signedUnit(latestComponents?.[component.key], component.unit, 1) }}
            </template>
          </div>
        </div>
      </div>

      <div
        v-if="failedSources.length"
        class="flex items-start gap-2 text-[10px] text-[var(--tape-down)] bg-[var(--tape-down-soft)] rounded px-2 py-1.5"
      >
        <IconTriangleAlert class="size-3 mt-px shrink-0" />
        <span>
          Some sources failed:
          <span class="font-mono">
            {{ failedSources.map((f) => f.label).join(', ') }}
          </span>
          — TACO total reflects only the components that loaded.
        </span>
      </div>
    </div>

    <div class="relative w-full" :style="{ height: `${chartHeight}px` }">
      <div ref="chartEl" class="w-full h-full" />

      <ChartSkeleton
        v-if="tacoLoading && !hasData"
        label="Loading TACO index"
      />

      <div
        v-else-if="tacoError && !hasData"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 bg-[var(--tape-surface)]"
      >
        <IconTriangleAlert class="size-5 text-[var(--tape-down)]" />
        <p class="text-sm text-[var(--tape-down)] max-w-md">{{ tacoError }}</p>
        <button class="btn-outline h-8 px-3 text-xs mt-1" @click="load(true)">
          Retry
        </button>
      </div>
    </div>

    <footer class="flex items-center justify-between gap-3 flex-wrap text-[10px] text-soft">
      <span>
        Sources: FRED, Yahoo Finance, manually curated events
      </span>
      <span v-if="taco?.asOf" class="text-mono">
        {{ taco.asOf }}
        <template v-if="lastUpdatedRel"> / Cached {{ lastUpdatedRel }}</template>
      </span>
    </footer>
  </article>
</template>
