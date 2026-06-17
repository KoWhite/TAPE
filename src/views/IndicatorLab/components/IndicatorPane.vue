<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import type { IndicatorResult } from '@/types/indicator'

/**
 * Render one indicator result as a small chart pane. Handles both
 * "overlay-style" indicators (series rendered as lines) and separate-pane
 * indicators (RSI, MACD, etc.) -currently presented identically as
 * their own chart instance below the price chart.
 *
 * Lifecycle:
 *  - Chart is constructed in onMounted (guaranteed DOM exists)
 *  - Re-built on prop changes via the result watcher
 *  - ResizeObserver keeps it sized to the container
 *  - MutationObserver on <html> rebuilds on dark/light flip
 *
 * MACD's "histogram" series is rendered as bars; everything else is a
 * line. Detection is purely by series name to keep this component
 * declarative -backend doesn't have to flag it.
 */

interface Props {
  result: IndicatorResult
  /** Approx pixel height for the pane. Defaults to 140 -enough to read
   *  the indicator without dwarfing the price chart above. */
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  height: 140,
})

const root = ref<HTMLDivElement | null>(null)
const buildError = ref<string | null>(null)

let chart: IChartApi | null = null
let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null

function tokens() {
  const cs = getComputedStyle(document.documentElement)
  return {
    text: cs.getPropertyValue('--tape-text').trim() || '#111',
    soft: cs.getPropertyValue('--tape-text-soft').trim() || '#888',
    border: cs.getPropertyValue('--tape-border').trim() || '#e5e5e5',
    up: cs.getPropertyValue('--tape-up').trim() || '#22c55e',
    down: cs.getPropertyValue('--tape-down').trim() || '#ef4444',
  }
}

const PALETTE = [
  '#3b82f6',  // blue
  '#22c55e',  // green
  '#ef4444',  // red
  '#f59e0b',  // amber
  '#a855f7',  // purple
]

function colorFor(name: string, index: number): string {
  if (name === 'plus_di' || name === 'upper') return '#22c55e'
  if (name === 'minus_di' || name === 'lower') return '#ef4444'
  return PALETTE[index % PALETTE.length]
}

function teardownObservers(): void {
  ro?.disconnect()
  mo?.disconnect()
  ro = null
  mo = null
}

function destroy(): void {
  teardownObservers()
  chart?.remove()
  chart = null
}

function build(): void {
  if (!root.value) return
  destroy()
  buildError.value = null

  try {
    const t = tokens()
    const hints = props.result.meta?.chartHints ?? {}

    chart = createChart(root.value, {
      // Guard against 0 width during first paint -observer below will
      // fix it as soon as layout settles.
      width: Math.max(100, root.value.clientWidth || 600),
      height: props.height,
      autoSize: false,
      layout: {
        background: { color: 'transparent' },
        textColor: t.text,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: t.border, style: 1 },
        horzLines: { color: t.border, style: 1 },
      },
      rightPriceScale: {
        borderColor: t.border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: hints.yMin == null && hints.yMax == null,
      },
      timeScale: {
        borderColor: t.border,
        visible: true,
        timeVisible: false,
      },
      crosshair: { mode: 1 },
    })

    let firstSeries: ISeriesApi<'Line' | 'Histogram'> | null = null
    let plottedAny = false

    props.result.series.forEach((s, idx) => {
      if (!chart) return
      const data = s.points
        .filter((p) => p.value !== null && Number.isFinite(p.value as number))
        .map((p) => ({
          time: p.time as Time,
          value: p.value as number,
        }))

      if (data.length === 0) return
      plottedAny = true

      const isHistogram = s.name === 'histogram'

      if (isHistogram) {
        const sr = chart.addSeries(HistogramSeries, {
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        })
        const colored = data.map((d) => ({
          ...d,
          color: d.value >= 0 ? t.up + 'cc' : t.down + 'cc',
        }))
        sr.setData(colored)
        if (!firstSeries) firstSeries = sr
      } else {
        const sr = chart.addSeries(LineSeries, {
          color: colorFor(s.name, idx),
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        })
        sr.setData(data)
        if (!firstSeries) firstSeries = sr
      }
    })

    // Reference lines (oversold/overbought, zero baseline).
    if (firstSeries && plottedAny) {
      const refLines: number[] = [
        ...(hints.refLines ?? []),
        ...(hints.zeroLine ? [0] : []),
      ]
      for (const v of refLines) {
        ;(firstSeries as ISeriesApi<'Line' | 'Histogram'>).createPriceLine({
          price: v,
          color: t.soft,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: '',
        })
      }
    }

    chart.timeScale().fitContent()

    // Observers -width tracking + theme flip rebuild.
    ro = new ResizeObserver(() => {
      if (chart && root.value) {
        chart.applyOptions({
          width: Math.max(100, root.value.clientWidth),
          height: props.height,
        })
      }
    })
    ro.observe(root.value)

    mo = new MutationObserver(() => build())
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  } catch (e) {
    buildError.value = (e as Error).message
    console.error('[IndicatorPane] build failed:', e)
  }
}

onMounted(() => {
  build()
})

// Re-build whenever the result changes -covers param tweaks, code
// changes, period switches.
watch(
  () => props.result,
  () => build(),
  { deep: true },
)

onBeforeUnmount(() => destroy())

const seriesLegend = computed(() =>
  props.result.series
    .filter((s) => s.points.some((p) => p.value !== null))
    .map((s, idx) => ({
      name: s.name,
      color: colorFor(s.name, idx),
    })),
)
</script>

<template>
  <div class="space-y-2">
    <!-- Tiny legend strip -the chart itself doesn't render labels per
         line, so this is the only way the user knows MACD vs Signal. -->
    <div
      v-if="seriesLegend.length > 1"
      class="flex items-center gap-3 text-[10px] text-soft tracking-wider uppercase"
    >
      <span
        v-for="s in seriesLegend"
        :key="s.name"
        class="inline-flex items-center gap-1.5"
      >
        <span class="size-2 rounded-full" :style="{ background: s.color }" />
        {{ s.name }}
      </span>
    </div>

    <div
      ref="root"
      class="w-full"
      :style="{ height: props.height + 'px', minHeight: props.height + 'px' }"
    />

    <p v-if="buildError" class="text-[11px] text-[var(--tape-down)]">
      Chart failed: {{ buildError }}
    </p>
  </div>
</template>
