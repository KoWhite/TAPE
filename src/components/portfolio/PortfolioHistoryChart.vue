<script setup lang="ts">
import { computed, ref } from 'vue'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconActivity from '~icons/lucide/activity'
import type Highcharts from 'highcharts'
import type { PortfolioSnapshot } from '@/stores/portfolioHistory'
import { useHighcharts } from '@/composables/useHighcharts'
import { useStableData } from '@/composables/useStableData'
import { getThemeTokens, withAlpha, MONO_FONT } from '@/utils/echartsTheme'
import { formatChange, formatPercent } from '@/utils/format'

const props = defineProps<{ snapshots: PortfolioSnapshot[] }>()

type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'ALL'
const RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y', 'ALL']
const range = ref<RangeKey>('3M')

type MetricKey = 'equity' | 'pnl' | 'return'
const metric = ref<MetricKey>('equity')

const filtered = computed<PortfolioSnapshot[]>(() => {
  const all = props.snapshots
  if (all.length === 0) return []
  if (range.value === 'ALL') return all
  const days = range.value === '1M' ? 30 : range.value === '3M' ? 90 : range.value === '6M' ? 180 : 365
  const cutoff = Date.now() - days * 86_400_000
  return all.filter((s) => new Date(`${s.date}T00:00:00`).getTime() >= cutoff)
})

const first = computed(() => filtered.value[0] ?? null)
const last = computed(() => filtered.value.at(-1) ?? null)

/** Period return for the active range -Value uses (last/first - 1),
 *  P&L uses absolute Δ since neither pnl baseline can divide cleanly. */
const periodChange = computed(() => {
  if (!first.value || !last.value) return null
  if (metric.value === 'equity') {
    const firstValue = first.value.totalEquity ?? first.value.value
    const lastValue = last.value.totalEquity ?? last.value.value
    if (!firstValue) return null
    return {
      abs: lastValue - firstValue,
      pct: lastValue / firstValue - 1,
    }
  }
  if (metric.value === 'return') {
    const firstReturn = first.value.returnPct ?? 0
    const lastReturn = last.value.returnPct ?? 0
    return {
      abs: lastReturn - firstReturn,
      pct: lastReturn - firstReturn,
    }
  }
  return {
    abs: (last.value.totalPnl ?? last.value.pnl) - (first.value.totalPnl ?? first.value.pnl),
    pct: null as number | null,
  }
})

const trendDir = computed<'up' | 'down' | 'flat'>(() => {
  const c = periodChange.value
  if (!c) return 'flat'
  if (Math.abs(c.abs) < 0.005) return 'flat'
  return c.abs > 0 ? 'up' : 'down'
})

const chartEl = ref<HTMLDivElement | null>(null)

/** Feed the (destroy+recreate) Highcharts builder a reference that only
 *  changes structurally. Today's snapshot is rewritten on every quote poll,
 *  so without this the whole stockChart rebuilds every few seconds. The
 *  fingerprint keys on range/metric, point count, and the last point's
 *  rounded value — real day-to-day movement still repaints. */
const chartPoints = useStableData(
  () => filtered.value,
  (pts) => {
    const tail = pts.at(-1)
    const tv = tail
      ? metric.value === 'equity'
        ? (tail.totalEquity ?? tail.value)
        : metric.value === 'return'
        ? (tail.returnPct ?? 0) * 100
        : (tail.totalPnl ?? tail.pnl)
      : 0
    return `${range.value}|${metric.value}|${pts.length}|${Math.round(tv)}`
  },
)

useHighcharts(chartEl, () => {
  const pts = chartPoints.value
  if (pts.length < 2) return null

  const t = getThemeTokens()
  const lineCol = trendDir.value === 'down' ? t.down : trendDir.value === 'up' ? t.up : t.accent

  const data: [number, number][] = pts.map((s) => [
    new Date(`${s.date}T00:00:00`).getTime(),
    metric.value === 'equity'
      ? (s.totalEquity ?? s.value)
      : metric.value === 'return'
      ? (s.returnPct ?? 0) * 100
      : (s.totalPnl ?? s.pnl),
  ])

  const costData: [number, number][] | null =
    metric.value === 'equity'
      ? pts.map((s) => [new Date(`${s.date}T00:00:00`).getTime(), s.costBasis ?? s.cost])
      : null

  const options: Highcharts.Options = {
    chart: {
      backgroundColor: 'transparent',
      style: { fontFamily: MONO_FONT },
      spacing: [12, 12, 8, 4],
      animation: false,
    },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      type: 'datetime',
      lineColor: 'transparent',
      tickColor: 'transparent',
      labels: {
        style: { color: t.textSoft, fontSize: '10px', fontFamily: MONO_FONT },
      },
      crosshair: { color: t.borderHover, width: 1, dashStyle: 'Solid' },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: t.border,
      gridLineDashStyle: 'ShortDash',
      labels: {
        style: { color: t.textSoft, fontSize: '10px', fontFamily: MONO_FONT },
        formatter() {
          const v = Number(this.value)
          if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
          if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`
          return metric.value === 'return' ? `${v.toFixed(1)}%` : v.toFixed(0)
        },
      },
      plotLines:
        metric.value === 'pnl'
          ? [{ value: 0, color: t.borderHover, width: 1, zIndex: 3 }]
          : [],
    },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 8,
      shadow: false,
      padding: 8,
      shared: true,
      style: { color: t.text, fontFamily: MONO_FONT, fontSize: '12px' },
      useHTML: true,
      formatter() {
        const ts = Number(this.x)
        const d = new Date(ts).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        const points = this.points ?? [this]
        const rows = points
          .map((p) => {
            const v = Number(p.y)
            const sign = v < 0 ? '-' : ''
            const abs = Math.abs(v).toFixed(2)
            return `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:${t.textSoft}">${p.series.name}</span><span style="color:${t.text};font-weight:600">${sign}${abs}</span></div>`
          })
          .join('')
        return (
          `<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${t.textSoft};margin-bottom:4px">${d}</div>` +
          rows
        )
      },
    },
    plotOptions: {
      area: {
        marker: {
          enabled: false,
          states: { hover: { enabled: true, radius: 4, lineWidth: 2, lineColor: t.bgElev } },
        },
        lineWidth: 1.75,
        states: { hover: { lineWidthPlus: 0 } },
      },
      line: {
        marker: { enabled: false },
        states: { hover: { lineWidthPlus: 0 } },
      },
    },
    series: [
      {
        type: 'area',
        name:
          metric.value === 'equity'
            ? 'Total Equity'
            : metric.value === 'return'
            ? 'Return %'
            : 'Total P&L',
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
      ...(costData
        ? ([
            {
              type: 'line',
              name: 'Net Invested',
              data: costData,
              color: t.textSoft,
              dashStyle: 'ShortDash',
              lineWidth: 1,
              enableMouseTracking: true,
            },
          ] as Highcharts.SeriesOptionsType[])
        : []),
    ],
    rangeSelector: { enabled: false },
    navigator: { enabled: false },
    scrollbar: { enabled: false },
  }

  return options
}, { constructor: 'stockChart' })
</script>

<template>
  <article class="surface p-5 sm:p-6 flex flex-col gap-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconActivity class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">Portfolio history</h3>
        <span class="text-[10px] text-soft tracking-wider uppercase">
          {{ filtered.length }} day{{ filtered.length === 1 ? '' : 's' }}
        </span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex gap-1">
          <button
            v-for="m in (['equity', 'pnl', 'return'] as const)"
            :key="m"
            class="px-2.5 h-7 rounded-lg text-[11px] font-medium tracking-wide transition-colors"
            :class="
              metric === m
                ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
                : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
            "
            @click="metric = m"
          >
            {{ m === 'equity' ? 'Equity' : m === 'return' ? 'Return %' : 'P&L' }}
          </button>
        </div>
        <div class="flex gap-1">
          <button
            v-for="r in RANGES"
            :key="r"
            class="px-2.5 h-7 rounded-lg text-[11px] font-medium tracking-wide transition-colors"
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
      </div>
    </header>

    <div v-if="last" class="flex items-end justify-between gap-4 flex-wrap">
      <div class="flex flex-col">
        <span class="text-[10px] uppercase tracking-wider text-soft">
          {{ metric === 'equity' ? 'Latest equity' : metric === 'return' ? 'Latest return' : 'Latest P&L' }}
        </span>
        <span
          class="text-mono text-2xl sm:text-3xl font-semibold tracking-tight mt-1"
          :class="
            metric !== 'equity'
              ? (metric === 'return' ? last.returnPct ?? 0 : last.totalPnl ?? last.pnl) > 0
                ? 'text-[var(--tape-up)]'
                : (metric === 'return' ? last.returnPct ?? 0 : last.totalPnl ?? last.pnl) < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
              : 'text-[var(--tape-text)]'
          "
        >
          {{
            metric === 'equity'
              ? (last.totalEquity ?? last.value).toFixed(2)
              : metric === 'return'
              ? formatPercent(last.returnPct ?? 0)
              : (last.totalPnl ?? last.pnl).toFixed(2)
          }}
        </span>
      </div>
      <div v-if="periodChange" class="flex flex-col items-end gap-1.5">
        <span class="text-[10px] uppercase tracking-wider text-soft">
          {{ range }} change
        </span>
        <span
          class="pill"
          :class="
            trendDir === 'up'
              ? 'pill-up'
              : trendDir === 'down'
              ? 'pill-down'
              : 'pill-flat'
          "
        >
          <component
            :is="trendDir === 'down' ? IconTrendingDown : IconTrendingUp"
            class="size-3"
          />
          {{ metric === 'return' ? formatPercent(periodChange.abs) : formatChange(periodChange.abs) }}
          <template v-if="periodChange.pct !== null">
            <span v-if="metric !== 'return'">· {{ formatPercent(periodChange.pct) }}</span>
          </template>
        </span>
      </div>
    </div>

    <div class="relative w-full" style="height: 260px">
      <div ref="chartEl" class="w-full h-full" />
      <div
        v-if="filtered.length < 2"
        class="absolute inset-0 flex-center text-sm text-soft text-center px-6"
      >
        <span>
          Not enough history yet -snapshots are recorded each time quotes
          refresh. Come back tomorrow to see the curve build.
        </span>
      </div>
    </div>
  </article>
</template>
