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
 * Yield-curve spread chart. Two FRED-provided spreads on a shared axis:
 *   T10Y2Y  — 10Y minus 2Y, the classic recession indicator
 *   T10Y3M  — 10Y minus 3M, the NY Fed model's preferred version
 *
 * The 0% reference line is the recession-signal threshold: values below
 * zero mean the curve is inverted. We use FRED's pre-computed spreads
 * rather than subtracting raw series ourselves — that avoids alignment
 * issues on holiday gaps and matches the canonical Bloomberg/FRED chart.
 *
 * Both spreads are reported in percentage points (FRED units: "Percent").
 */

interface SpreadSpec {
  id: string
  label: string
  color: string
}

const SPREADS: SpreadSpec[] = [
  { id: 'T10Y2Y', label: '10Y − 2Y', color: '#10b981' },
  { id: 'T10Y3M', label: '10Y − 3M', color: '#f59e0b' },
]

const RANGES: MacroRange[] = ['1Y', '3Y', '5Y', '10Y', 'ALL']
const START = '1990-01-01'

const macro = useMacroStore()
const { loading, errors } = storeToRefs(macro)
const { isMobile } = useBreakpoint()

const range = ref<MacroRange>('3Y')

function loadAll(force = false): void {
  for (const s of SPREADS) void macro.load(s.id, { start: START, force })
}
onMounted(() => loadAll(false))

const isLoading = computed(() => SPREADS.some((s) => loading.value[s.id]))
const allFailed = computed(() => SPREADS.every((s) => errors.value[s.id]))
const errorMsg = computed(
  () => SPREADS.map((s) => errors.value[s.id]).find(Boolean) ?? null,
)

const lastUpdatedRel = computed(() => {
  const t = Math.max(...SPREADS.map((s) => macro.fetchedAt(s.id) ?? 0))
  return t ? formatRelative(new Date(t).toISOString()) : null
})

/** Latest spread reading for each series. Drives the headline chips that
 *  show "inverted by X bp" / "steep by X bp" status above the chart. */
const latest = computed(() =>
  SPREADS.map((s) => {
    const series = macro.get(s.id)
    const last = series?.observations.at(-1)
    return { ...s, value: last?.value ?? null, date: last?.date ?? null }
  }),
)

const initialExtremes = computed<[number, number] | null>(() => {
  const all = SPREADS.flatMap((s) => macro.get(s.id)?.observations ?? [])
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
const chartHeight = computed(() => (isMobile.value ? 260 : 340))

/** AI context: current spread + whether it's inverted, expressed in
 *  basis points (Wall Street's native unit here). The note carries the
 *  inversion status so the LLM doesn't have to derive it from the sign. */
useMacroAiContext({
  id: 'yield-curve-spreads',
  getSnapshot: (): ChartSnapshot | null => {
    const rows = latest.value.filter((l) => l.value !== null)
    if (rows.length === 0) return null
    const asOf = rows
      .map((l) => l.date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1)
    return {
      id: 'yield-curve-spreads',
      label: 'Yield-curve spreads',
      description:
        'FRED-computed Treasury spreads. Negative = inverted, the classic recession indicator.',
      asOf: asOf ?? undefined,
      metrics: rows.map((l) => {
        const bps = Math.round((l.value as number) * 100)
        const tone =
          bps > 5 ? 'steep' : bps < -5 ? 'inverted' : 'flat'
        return {
          label: l.label,
          value: l.value,
          unit: '%',
          note: `${bps > 0 ? '+' : ''}${bps} bp · ${tone}`,
        }
      }),
    }
  },
})

useHighcharts(
  chartEl,
  () => {
    const data = SPREADS.map((s) => ({ spec: s, series: macro.get(s.id) }))
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
      showInNavigator: spec.id === 'T10Y2Y',
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
          text: mobile ? undefined : 'Spread (%)',
          style: { color: t.textSoft, fontSize: '10px', fontFamily: MONO_FONT },
        },
        gridLineColor: t.border,
        gridLineDashStyle: 'ShortDash',
        labels: {
          style: { color: t.textSoft, fontSize: mobile ? '9px' : '10px', fontFamily: MONO_FONT },
          formatter() {
            const v = Number(this.value)
            return `${v > 0 ? '+' : ''}${formatNumber(v, 2)}%`
          },
        },
        // 0% baseline — anything below this is an inversion (the recession signal).
        plotLines: [
          {
            value: 0,
            color: t.textSoft,
            width: 1,
            dashStyle: 'Dash',
            zIndex: 3,
            label: {
              text: 'Inversion threshold (0%)',
              align: 'left',
              x: 6,
              y: -4,
              style: {
                color: t.textSoft,
                fontFamily: MONO_FONT,
                fontSize: '10px',
              },
            },
          },
        ],
        // Tint the negative half so inversions read at a glance.
        plotBands: [
          {
            from: -10,
            to: 0,
            color: withAlpha(t.down, 0.06),
            zIndex: 0,
          },
        ],
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
              const v = Number(p.y)
              const formatted = `${v > 0 ? '+' : ''}${formatNumber(v, 2)}%`
              return (
                `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:2px">` +
                `<span style="color:${c}">${p.series.name}</span>` +
                `<span style="color:${t.text};font-weight:600">${formatted}</span>` +
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
          marker: { enabled: false, states: { hover: { enabled: true, radius: 4 } } },
          lineWidth: 1.5,
          connectNulls: false,
          states: { hover: { lineWidthPlus: 0 } },
        },
      },
      series: hcSeries,
      navigator: {
        enabled: !mobile,
        height: 32,
        margin: 14,
        maskFill: withAlpha(SPREADS[0].color, 0.15),
        maskInside: true,
        outlineColor: t.border,
        outlineWidth: 1,
        series: {
          type: 'areaspline',
          color: SPREADS[0].color,
          lineColor: SPREADS[0].color,
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

function spreadLabel(value: number | null): { label: string; tone: 'up' | 'down' | 'neutral' } {
  if (value === null) return { label: '--', tone: 'neutral' }
  // Report in basis points for readability — Wall Street speaks bps here.
  const bps = Math.round(value * 100)
  if (bps > 5) return { label: `+${bps} bp · steep`, tone: 'up' }
  if (bps < -5) return { label: `${bps} bp · inverted`, tone: 'down' }
  return { label: `${bps > 0 ? '+' : ''}${bps} bp · flat`, tone: 'neutral' }
}
</script>

<template>
  <article class="surface p-4 sm:p-6 flex flex-col gap-3 sm:gap-4 relative">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight leading-snug">
            Yield Curve Spreads
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            T10Y2Y · T10Y3M
          </span>
        </div>
        <p class="text-xs text-muted mt-0.5">
          Negative values = curve inverted. The NY Fed's recession model uses
          10Y − 3M; markets quote 10Y − 2Y. Both are pre-computed by FRED.
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

    <div class="grid grid-cols-2 gap-2 sm:gap-3">
      <div
        v-for="entry in latest"
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
        <div class="flex items-baseline gap-2 mt-0.5">
          <div class="text-mono text-base sm:text-lg font-semibold">
            <template v-if="entry.value !== null">
              {{ entry.value > 0 ? '+' : '' }}{{ formatNumber(entry.value, 2) }}<span class="text-soft text-xs ml-0.5">%</span>
            </template>
            <span v-else class="text-soft text-sm">--</span>
          </div>
          <span
            v-if="entry.value !== null"
            class="text-[10px] font-medium uppercase tracking-wider"
            :class="{
              'text-[var(--tape-up)]': spreadLabel(entry.value).tone === 'up',
              'text-[var(--tape-down)]': spreadLabel(entry.value).tone === 'down',
              'text-soft': spreadLabel(entry.value).tone === 'neutral',
            }"
          >
            {{ spreadLabel(entry.value).label }}
          </span>
        </div>
        <div v-if="entry.date" class="text-[10px] text-soft text-mono">
          {{ entry.date }}
        </div>
      </div>
    </div>

    <div class="relative w-full" :style="{ height: `${chartHeight}px` }">
      <div ref="chartEl" class="w-full h-full" />

      <ChartSkeleton
        v-if="isLoading && SPREADS.every((s) => !macro.get(s.id))"
        label="Loading spreads"
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
