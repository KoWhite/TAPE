<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesMarkersPluginApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { KlineBar } from '@/types/kline'
import { getThemeTokens, MONO_FONT, withAlpha } from '@/utils/echartsTheme'
import { formatChange, formatCompact, formatPercent } from '@/utils/format'
import { boll, macd, rsi } from '@/utils/indicators'

export interface IndicatorFlags {
  boll?: boolean
  rsi?: boolean
  macd?: boolean
}

/** One backend-computed series to overlay on the price pane. The parent
 *  resolves these from the indicator catalog + computeIndicator() call so
 *  this component stays a pure renderer (no store dependency). Color is
 *  optional — when missing we cycle through a small palette. */
export interface KlineOverlay {
  /** Unique key — e.g. `${indicatorId}:${seriesName}:${paramsHash}`. Used as
   *  the Vue list key and to dedupe re-creation when toggling overlays. */
  key: string
  label: string
  color?: string
  /** ISO date for daily/above, Unix seconds for intraday — same as KlineBar.time. */
  points: { time: KlineBar['time']; value: number | null }[]
}

export interface KlineTradeMarker {
  id: string
  time: KlineBar['time']
  type: 'buy' | 'sell' | 'dividend' | 'fee'
  label: string
  price?: number
}

const props = defineProps<{
  bars: KlineBar[]
  /** True when bars are intraday (time = unix seconds). */
  intraday?: boolean
  /** Optional indicator overlays -toggled from StockDetail. */
  indicators?: IndicatorFlags
  /** Extra series to draw on the price pane. Pure data — no compute here. */
  overlays?: KlineOverlay[]
  /** Personal ledger markers to paint on the candle series. */
  tradeMarkers?: KlineTradeMarker[]
}>()

/** Fallback color palette when an overlay doesn't specify one. Picked to be
 *  distinct from the MA5/10/20 trio and from BOLL's cyan. */
const OVERLAY_PALETTE = ['#10b981', '#f97316', '#0ea5e9', '#eab308', '#d946ef', '#14b8a6']

const root = ref<HTMLDivElement | null>(null)

/** Index into props.bars currently under the crosshair, or null when the
 *  pointer is off-chart. */
const hoverIndex = ref<number | null>(null)

/** Crosshair pixel position within the chart container -drives the
 *  floating tooltip. Null when the pointer is off-chart. */
const hoverPoint = ref<{ x: number; y: number } | null>(null)

let chart: IChartApi | null = null
let candle: ISeriesApi<'Candlestick'> | null = null
let volume: ISeriesApi<'Histogram'> | null = null
let ma5: ISeriesApi<'Line'> | null = null
let ma10: ISeriesApi<'Line'> | null = null
let ma20: ISeriesApi<'Line'> | null = null
let bollUpper: ISeriesApi<'Line'> | null = null
let bollMid: ISeriesApi<'Line'> | null = null
let bollLower: ISeriesApi<'Line'> | null = null
let rsiLine: ISeriesApi<'Line'> | null = null
let macdHist: ISeriesApi<'Histogram'> | null = null
let macdDif: ISeriesApi<'Line'> | null = null
let macdDea: ISeriesApi<'Line'> | null = null
let markersApi: ISeriesMarkersPluginApi<Time> | null = null
/** Map from overlay.key → series. Rebuilt on every build() so toggling an
 *  overlay on/off can selectively add/remove without nuking the chart. */
let overlaySeries: Map<string, ISeriesApi<'Line'>> = new Map()
let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null

function toTime(t: KlineBar['time']): Time {
  return (typeof t === 'number' ? t : t) as Time
}

function markerColor(marker: KlineTradeMarker): string {
  const t = getThemeTokens()
  if (marker.type === 'buy') return t.up
  if (marker.type === 'sell') return t.down
  if (marker.type === 'dividend') return t.accent
  return t.textSoft
}

function toSeriesMarker(marker: KlineTradeMarker): SeriesMarker<Time> {
  if (marker.type === 'buy') {
    return {
      id: marker.id,
      time: toTime(marker.time),
      position: 'belowBar',
      shape: 'arrowUp',
      color: markerColor(marker),
      text: marker.label,
      size: 1.15,
    }
  }
  if (marker.type === 'sell') {
    return {
      id: marker.id,
      time: toTime(marker.time),
      position: 'aboveBar',
      shape: 'arrowDown',
      color: markerColor(marker),
      text: marker.label,
      size: 1.15,
    }
  }
  return {
    id: marker.id,
    time: toTime(marker.time),
    position: marker.price ? 'atPriceMiddle' : 'inBar',
    price: marker.price,
    shape: 'circle',
    color: markerColor(marker),
    text: marker.label,
    size: 0.85,
  } as SeriesMarker<Time>
}

function movingAverage(bars: KlineBar[], period: number) {
  const out: { time: Time; value: number }[] = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= period) sum -= bars[i - period].close
    if (i >= period - 1) {
      out.push({ time: toTime(bars[i].time), value: sum / period })
    }
  }
  return out
}

function build(): void {
  if (!root.value) return
  // Tear down any prior instance -simpler than diffing options on theme flip
  // or indicator toggle.
  chart?.remove()
  chart = candle = volume = ma5 = ma10 = ma20 = null
  bollUpper = bollMid = bollLower = null
  rsiLine = null
  macdHist = macdDif = macdDea = null
  markersApi = null
  overlaySeries = new Map()

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
      scaleMargins: { top: 0.08, bottom: 0.28 },
    },
    timeScale: {
      borderColor: t.border,
      timeVisible: !!props.intraday,
      secondsVisible: false,
      rightOffset: 6,
      barSpacing: 10,
      minBarSpacing: 2,
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

  // Track which bar is under the crosshair so the info panel can mirror it.
  // `param.time` matches the bar's time field exactly -we map it back to an
  // index via a small lookup keyed off the current props.bars snapshot.
  chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.point) {
      hoverIndex.value = null
      hoverPoint.value = null
      return
    }
    const t = param.time as Time
    const idx = props.bars.findIndex((b) => toTime(b.time) === t)
    if (idx < 0) {
      hoverIndex.value = null
      hoverPoint.value = null
      return
    }
    hoverIndex.value = idx
    hoverPoint.value = { x: param.point.x, y: param.point.y }
  })

  candle = chart.addSeries(CandlestickSeries, {
    upColor: t.up,
    downColor: t.down,
    borderUpColor: t.up,
    borderDownColor: t.down,
    wickUpColor: t.up,
    wickDownColor: t.down,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  })
  markersApi = createSeriesMarkers(candle, [], { zOrder: 'top' })

  // Volume histogram -overlaid in the same pane, pinned to the bottom
  // 22% via a dedicated price scale ('vol').
  volume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
    color: withAlpha(t.up, 0.5),
  })
  chart.priceScale('vol').applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
    borderVisible: false,
  })

  ma5 = chart.addSeries(LineSeries, {
    color: '#f59e0b',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  })
  ma10 = chart.addSeries(LineSeries, {
    color: '#3b82f6',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  })
  ma20 = chart.addSeries(LineSeries, {
    color: '#a855f7',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  })

  if (props.indicators?.boll) {
    const bollOpts = {
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as const
    bollUpper = chart.addSeries(LineSeries, { ...bollOpts, color: '#22d3ee' })
    bollMid = chart.addSeries(LineSeries, {
      ...bollOpts,
      color: withAlpha('#22d3ee', 0.6),
      lineStyle: 2,
    })
    bollLower = chart.addSeries(LineSeries, { ...bollOpts, color: '#22d3ee' })
  }

  // Generic overlay series — one per entry in props.overlays. Placed after
  // BOLL so they paint on top, and before RSI/MACD which live in separate panes.
  if (props.overlays?.length) {
    props.overlays.forEach((ov, i) => {
      const color = ov.color ?? OVERLAY_PALETTE[i % OVERLAY_PALETTE.length]
      const series = chart!.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      overlaySeries.set(ov.key, series)
    })
  }

  if (props.indicators?.rsi) {
    rsiLine = chart.addSeries(
      LineSeries,
      {
        color: '#ec4899',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      },
      1,
    )
    chart.panes()[1]?.setHeight(96)
    rsiLine.createPriceLine({
      price: 70,
      color: withAlpha(t.down, 0.6),
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: '',
    })
    rsiLine.createPriceLine({
      price: 30,
      color: withAlpha(t.up, 0.6),
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: false,
      title: '',
    })
  }

  if (props.indicators?.macd) {
    const macdPane = props.indicators?.rsi ? 2 : 1
    macdHist = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      macdPane,
    )
    macdDif = chart.addSeries(
      LineSeries,
      {
        color: '#fbbf24',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      macdPane,
    )
    macdDea = chart.addSeries(
      LineSeries,
      {
        color: '#60a5fa',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      macdPane,
    )
    chart.panes()[macdPane]?.setHeight(110)
  }

  apply(props.bars)
}

function apply(bars: KlineBar[]): void {
  if (!chart || !candle || !volume) return
  if (bars.length === 0) {
    candle.setData([])
    volume.setData([])
    ma5?.setData([])
    ma10?.setData([])
    ma20?.setData([])
    return
  }

  const t = getThemeTokens()
  candle.setData(
    bars.map((b) => ({
      time: toTime(b.time),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    })),
  )
  volume.setData(
    bars.map((b) => ({
      time: toTime(b.time),
      value: b.volume,
      color: withAlpha(b.close >= b.open ? t.up : t.down, 0.5),
    })),
  )
  ma5?.setData(movingAverage(bars, 5))
  ma10?.setData(movingAverage(bars, 10))
  ma20?.setData(movingAverage(bars, 20))
  markersApi?.setMarkers((props.tradeMarkers ?? []).map(toSeriesMarker))

  // Indicators -translate the Series<number|null> output into the {time, value}
  // shape lightweight-charts expects, dropping nulls during warm-up.
  if (bollUpper && bollMid && bollLower) {
    const closes = bars.map((b) => b.close)
    const { upper, middle, lower } = boll(closes, 20, 2)
    const pack = (arr: (number | null)[]) =>
      arr
        .map((v, i) => (v === null ? null : { time: toTime(bars[i].time), value: v }))
        .filter((p): p is { time: Time; value: number } => p !== null)
    bollUpper.setData(pack(upper))
    bollMid.setData(pack(middle))
    bollLower.setData(pack(lower))
  }
  if (rsiLine) {
    const closes = bars.map((b) => b.close)
    const data = rsi(closes, 14)
      .map((v, i) => (v === null ? null : { time: toTime(bars[i].time), value: v }))
      .filter((p): p is { time: Time; value: number } => p !== null)
    rsiLine.setData(data)
  }
  if (overlaySeries.size > 0 && props.overlays?.length) {
    for (const ov of props.overlays) {
      const series = overlaySeries.get(ov.key)
      if (!series) continue
      // Drop nulls (warm-up bars) and re-key the points to the chart's
      // Time type so lightweight-charts accepts them verbatim.
      const data = ov.points
        .filter((p): p is { time: KlineBar['time']; value: number } => p.value !== null)
        .map((p) => ({ time: toTime(p.time), value: p.value }))
      series.setData(data)
    }
  }

  if (macdHist && macdDif && macdDea) {
    const closes = bars.map((b) => b.close)
    const { dif, dea, hist } = macd(closes)
    const pack = (arr: (number | null)[]) =>
      arr
        .map((v, i) => (v === null ? null : { time: toTime(bars[i].time), value: v }))
        .filter((p): p is { time: Time; value: number } => p !== null)
    macdDif.setData(pack(dif))
    macdDea.setData(pack(dea))
    macdHist.setData(
      hist
        .map((v, i) =>
          v === null
            ? null
            : {
                time: toTime(bars[i].time),
                value: v,
                color: withAlpha(v >= 0 ? t.up : t.down, 0.7),
              },
        )
        .filter((p): p is { time: Time; value: number; color: string } => p !== null),
    )
  }

  // Default view: show the last ~90 bars so each candle is wide enough to
  // read at a glance. Older data is still in memory -scroll/pinch to pan.
  const visible = Math.min(90, bars.length)
  chart.timeScale().setVisibleLogicalRange({
    from: bars.length - visible,
    to: bars.length - 1,
  })
}

watch(
  () => props.bars,
  (b) => apply(b),
  { flush: 'post' },
)

watch(
  () => [
    props.indicators?.boll,
    props.indicators?.rsi,
    props.indicators?.macd,
    props.intraday,
    // Toggling which overlays are present requires recreating series; the
    // key list captures that without dragging the whole points array into
    // the dependency set (apply() re-pushes those on bar updates).
    (props.overlays ?? []).map((o) => o.key).join('|'),
  ],
  () => build(),
  { flush: 'post' },
)

// Points alone (without overlay membership change) only need re-apply.
watch(
  () => (props.overlays ?? []).map((o) => o.points),
  () => apply(props.bars),
  { flush: 'post', deep: true },
)

watch(
  () => props.tradeMarkers,
  () => apply(props.bars),
  { flush: 'post', deep: true },
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
  ;(ro as ResizeObserver | null)?.disconnect()
  ;(mo as MutationObserver | null)?.disconnect()
  chart?.remove()
  chart = null
})

/**
 * The bar currently under the crosshair, plus the change vs. the previous
 * bar's close. Null when the pointer is off-chart -drives whether the
 * floating tooltip renders at all.
 */
const activeInfo = computed(() => {
  const idx = hoverIndex.value
  if (idx === null) return null
  const bars = props.bars
  const bar = bars[idx]
  if (!bar) return null
  const prev = idx > 0 ? bars[idx - 1].close : bar.open
  const change = bar.close - prev
  return {
    bar,
    change,
    changePct: prev ? change / prev : 0,
    label: formatBarTime(bar.time),
    isUp: bar.close >= bar.open,
  }
})

const TOOLTIP_W = 200
const TOOLTIP_H = 196
const TOOLTIP_PAD = 12

/**
 * Pin the tooltip near the crosshair without overflowing the chart bounds.
 * Tries to sit to the upper-right of the cursor; flips horizontally if it
 * would clip the right edge, vertically if it would clip the bottom.
 */
const tooltipStyle = computed(() => {
  const pt = hoverPoint.value
  const el = root.value
  if (!pt || !el) return { display: 'none' }
  const w = el.clientWidth
  const h = el.clientHeight
  let left = pt.x + TOOLTIP_PAD
  if (left + TOOLTIP_W > w) left = pt.x - TOOLTIP_W - TOOLTIP_PAD
  if (left < 4) left = 4
  let top = pt.y - TOOLTIP_H - TOOLTIP_PAD
  if (top < 4) top = pt.y + TOOLTIP_PAD
  if (top + TOOLTIP_H > h) top = h - TOOLTIP_H - 4
  return { left: `${left}px`, top: `${top}px` }
})

function formatBarTime(time: KlineBar['time']): string {
  if (typeof time === 'number') {
    return new Date(time * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  return time
}

// Re-export Time helper for callers wanting to coerce the type.
export type { UTCTimestamp }
</script>

<template>
  <div class="relative w-full h-full">
    <div ref="root" class="absolute inset-0" />
    <div
      class="absolute top-2 left-3 flex items-center gap-3 text-[10px] font-medium tracking-wide pointer-events-none select-none"
    >
      <span class="flex items-center gap-1 text-[#f59e0b]">
        <span class="inline-block w-2 h-[2px] bg-current" /> MA5
      </span>
      <span class="flex items-center gap-1 text-[#3b82f6]">
        <span class="inline-block w-2 h-[2px] bg-current" /> MA10
      </span>
      <span class="flex items-center gap-1 text-[#a855f7]">
        <span class="inline-block w-2 h-[2px] bg-current" /> MA20
      </span>
      <span v-if="tradeMarkers?.length" class="flex items-center gap-1 text-[var(--tape-accent)]">
        <span class="inline-block size-1.5 rounded-full bg-current" /> Ledger
      </span>
    </div>

    <!-- Floating tooltip -only rendered while a bar is under the crosshair -->
    <div
      v-if="activeInfo"
      class="kline-tooltip absolute rounded-lg border border-[var(--tape-border)] px-3 py-2 text-[11px] pointer-events-none select-none shadow-md"
      :style="{ width: `${TOOLTIP_W}px`, ...tooltipStyle }"
    >
      <div class="text-mono text-[10px] text-soft mb-1.5 tracking-wide">
        {{ activeInfo.label }}
      </div>
      <dl class="space-y-0.5 text-mono">
        <div class="flex justify-between gap-2">
          <dt class="text-soft">Open</dt>
          <dd>{{ activeInfo.bar.open.toFixed(2) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-soft">High</dt>
          <dd class="text-[var(--tape-up)]">{{ activeInfo.bar.high.toFixed(2) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-soft">Low</dt>
          <dd class="text-[var(--tape-down)]">{{ activeInfo.bar.low.toFixed(2) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-soft">Close</dt>
          <dd :class="activeInfo.isUp ? 'text-[var(--tape-up)]' : 'text-[var(--tape-down)]'">
            {{ activeInfo.bar.close.toFixed(2) }}
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-soft">Change</dt>
          <dd
            :class="
              activeInfo.change > 0
                ? 'text-[var(--tape-up)]'
                : activeInfo.change < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatChange(activeInfo.change) }}
            ({{ formatPercent(activeInfo.changePct) }})
          </dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-soft">Volume</dt>
          <dd>{{ formatCompact(activeInfo.bar.volume) }}</dd>
        </div>
        <div class="flex justify-between gap-2">
          <dt class="text-soft">Turnover</dt>
          <dd>{{ formatCompact(activeInfo.bar.turnover) }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
/* Solid elevated surface + a layered drop shadow so the tooltip reads
 * cleanly over both bullish and bearish candles. `--tape-bg-elev` is white in
 * light mode and the dark-mode elevated panel color in dark mode. */
.kline-tooltip {
  background-color: var(--tape-bg-elev);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 8px 24px rgba(0, 0, 0, 0.12);
}
html.dark .kline-tooltip {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 12px 28px rgba(0, 0, 0, 0.5);
}
</style>
