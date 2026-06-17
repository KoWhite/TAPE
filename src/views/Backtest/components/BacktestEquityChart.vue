<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AreaSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type Time,
} from 'lightweight-charts'
import type { EquityPoint } from '@/types/backtest'

/**
 * Equity curve overlay: strategy net liquidation value vs the buy-and-
 * hold benchmark. Same lifecycle approach as IndicatorPane (onMounted
 * setup + watch update + observers for resize / theme flip).
 */

interface Props {
  equity: EquityPoint[]
  benchmark: EquityPoint[]
  /** Optional drawdown curve (negative decimals) -rendered as a red
   *  area series on a separate price scale beneath. */
  drawdown?: EquityPoint[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  drawdown: () => [],
  height: 320,
})

const root = ref<HTMLDivElement | null>(null)
const error = ref<string | null>(null)

let chart: IChartApi | null = null
let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null

function tokens() {
  const cs = getComputedStyle(document.documentElement)
  return {
    text: cs.getPropertyValue('--tape-text').trim() || '#111',
    soft: cs.getPropertyValue('--tape-text-soft').trim() || '#888',
    border: cs.getPropertyValue('--tape-border').trim() || '#e5e5e5',
    accent: cs.getPropertyValue('--tape-accent').trim() || '#3b82f6',
    up: cs.getPropertyValue('--tape-up').trim() || '#22c55e',
    down: cs.getPropertyValue('--tape-down').trim() || '#ef4444',
  }
}

function destroy(): void {
  ro?.disconnect()
  mo?.disconnect()
  ro = null
  mo = null
  chart?.remove()
  chart = null
}

function build(): void {
  if (!root.value) return
  destroy()
  error.value = null

  try {
    const t = tokens()

    chart = createChart(root.value, {
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
      rightPriceScale: { borderColor: t.border },
      timeScale: { borderColor: t.border, timeVisible: false },
      crosshair: { mode: 1 },
    })

    // Benchmark first (gray line) so the strategy sits on top in z-order.
    const benchData = props.benchmark
      .filter((p) => Number.isFinite(p.value))
      .map((p) => ({ time: p.time as Time, value: p.value }))
    if (benchData.length > 1) {
      const bench = chart.addSeries(LineSeries, {
        color: t.soft,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'Buy & Hold',
      })
      bench.setData(benchData)
    }

    const eqData = props.equity
      .filter((p) => Number.isFinite(p.value))
      .map((p) => ({ time: p.time as Time, value: p.value }))
    if (eqData.length > 1) {
      const eq = chart.addSeries(LineSeries, {
        color: t.accent,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'Strategy',
      })
      eq.setData(eqData)
    }

    // Drawdown on its own price scale at the bottom -red area going
    // negative from 0. Skipped when no data.
    const ddData = props.drawdown
      .filter((p) => Number.isFinite(p.value))
      .map((p) => ({ time: p.time as Time, value: p.value }))
    if (ddData.length > 1) {
      const dd = chart.addSeries(AreaSeries, {
        topColor: t.down + '55',
        bottomColor: t.down + '00',
        lineColor: t.down,
        lineWidth: 1,
        priceScaleId: 'dd',
        priceLineVisible: false,
        lastValueVisible: true,
        title: 'Drawdown',
      })
      dd.setData(ddData)
      chart.priceScale('dd').applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
        borderColor: t.border,
      })
    }

    chart.timeScale().fitContent()

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
    error.value = (e as Error).message
    console.error('[BacktestEquityChart] build failed:', e)
  }
}

onMounted(() => build())
watch(() => [props.equity, props.benchmark, props.drawdown], () => build(), { deep: true })
onBeforeUnmount(() => destroy())

const legend = computed(() => {
  const t = tokens()
  return [
    { name: 'Strategy', color: t.accent },
    { name: 'Buy & Hold', color: t.soft },
    ...(props.drawdown.length ? [{ name: 'Drawdown', color: t.down }] : []),
  ]
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-3 text-[10px] text-soft uppercase tracking-wider">
      <span
        v-for="l in legend"
        :key="l.name"
        class="inline-flex items-center gap-1.5"
      >
        <span class="h-0.5 w-3" :style="{ background: l.color }" />
        {{ l.name }}
      </span>
    </div>
    <div
      ref="root"
      class="w-full"
      :style="{ height: props.height + 'px', minHeight: props.height + 'px' }"
    />
    <p v-if="error" class="text-[11px] text-[var(--tape-down)]">
      Chart failed: {{ error }}
    </p>
  </div>
</template>
