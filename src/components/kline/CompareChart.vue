<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import {
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import type { KlineBar } from '@/types/kline'
import { getThemeTokens, MONO_FONT, withAlpha } from '@/utils/echartsTheme'

export interface CompareSeries {
  code: string
  symbol: string
  color: string
  bars: KlineBar[]
}

const props = defineProps<{
  series: CompareSeries[]
  /** True when bars are intraday (time = unix seconds). */
  intraday?: boolean
}>()

const root = ref<HTMLDivElement | null>(null)

let chart: IChartApi | null = null
let lines: Map<string, ISeriesApi<'Line'>> = new Map()
let mo: MutationObserver | null = null

function toTime(t: KlineBar['time']): Time {
  return (typeof t === 'number' ? t : t) as Time
}

/** Normalize each series to base-100 at its first bar so different price
 *  levels can be visually compared on the same axis. */
function normalize(bars: KlineBar[]): { time: Time; value: number }[] {
  if (bars.length === 0) return []
  const base = bars[0].close
  if (!base) return []
  return bars.map((b) => ({
    time: toTime(b.time),
    value: (b.close / base) * 100,
  }))
}

function build(): void {
  if (!root.value) return
  chart?.remove()
  chart = null
  lines = new Map()

  const t = getThemeTokens()
  const isDark = document.documentElement.classList.contains('dark')

  chart = createChart(root.value, {
    layout: {
      background: { color: 'transparent' },
      textColor: t.textSoft,
      fontFamily: MONO_FONT,
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: withAlpha(t.border, isDark ? 0.6 : 0.8), style: 0 },
      horzLines: { color: withAlpha(t.border, isDark ? 0.6 : 0.8), style: 0 },
    },
    rightPriceScale: {
      borderColor: t.border,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    timeScale: {
      borderColor: t.border,
      timeVisible: !!props.intraday,
      secondsVisible: false,
      rightOffset: 4,
      barSpacing: 6,
      minBarSpacing: 1,
    },
    crosshair: {
      mode: 1,
      vertLine: {
        color: t.borderHover,
        labelBackgroundColor: t.bgElev,
        width: 1,
        style: 2,
      },
      horzLine: {
        color: t.borderHover,
        labelBackgroundColor: t.bgElev,
        width: 1,
        style: 2,
      },
    },
    autoSize: true,
  })

  // Render the 100-line as a price line on the first series so it's tied to
  // the axis but doesn't add a separate data series to the legend.
  apply()
}

function apply(): void {
  if (!chart) return
  const seen = new Set<string>()

  for (const s of props.series) {
    seen.add(s.code)
    let line = lines.get(s.code)
    if (!line) {
      line = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        title: s.symbol,
      })
      lines.set(s.code, line)
    } else {
      line.applyOptions({ color: s.color, title: s.symbol })
    }
    line.setData(normalize(s.bars))
  }

  // Drop any series that's been removed from props.
  for (const [code, line] of lines) {
    if (!seen.has(code)) {
      chart.removeSeries(line)
      lines.delete(code)
    }
  }

  if (props.series.length > 0) chart.timeScale().fitContent()
}

watch(
  () => props.series,
  () => apply(),
  { flush: 'post', deep: true },
)

watch(
  () => props.intraday,
  () => build(),
  { flush: 'post' },
)

watch(
  root,
  (node, _old, onCleanup) => {
    if (!node) return
    build()
    mo = new MutationObserver(() => build())
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    onCleanup(() => {
      mo?.disconnect()
      mo = null
    })
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  mo?.disconnect()
  chart?.remove()
  chart = null
})
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="root" class="absolute inset-0" />
  </div>
</template>
