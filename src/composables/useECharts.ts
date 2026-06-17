import { onBeforeUnmount, ref, watch, watchEffect, type Ref } from 'vue'
import * as echarts from 'echarts/core'
import {
  BarChart,
  CandlestickChart,
  LineChart,
  PieChart,
  ScatterChart,
} from 'echarts/charts'
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

/**
 * Register the chart types and components used across the app. Add new ones
 * here as needed — every chart in the project shares this registration so
 * we stay tree-shake-friendly without each component re-registering.
 */
echarts.use([
  // charts
  LineChart,
  BarChart,
  PieChart,
  CandlestickChart,
  ScatterChart,
  // components
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  VisualMapComponent,
  // renderer
  CanvasRenderer,
])

type ChartInstance = ReturnType<typeof echarts.init>

/**
 * Mount an ECharts instance on `el` and re-apply `buildOption()` whenever
 * its reactive deps change. Also re-applies on:
 *   - container resize (ResizeObserver)
 *   - <html> class change (MutationObserver) — covers dark-mode toggling so
 *     option builders that read CSS vars get fresh values
 *
 * Returns the chart instance ref for callers that need to dispatch actions
 * (zoom programmatically, save as image, etc.).
 */
export function useECharts(
  el: Ref<HTMLElement | null>,
  buildOption: () => EChartsOption | null,
) {
  const chart = ref<ChartInstance | null>(null)
  const themeTick = ref(0)

  let ro: ResizeObserver | null = null
  let mo: MutationObserver | null = null

  function apply() {
    if (!chart.value) return
    const opt = buildOption()
    if (opt) chart.value.setOption(opt, { notMerge: true })
    else chart.value.clear()
  }

  // Initialize as soon as the element exists. Using watch instead of
  // onMounted lets v-if'd containers attach when they finally appear.
  const stopElWatch = watch(
    el,
    (node) => {
      if (!node || chart.value) return
      chart.value = echarts.init(node, undefined, { renderer: 'canvas' })
      apply()

      ro = new ResizeObserver(() => chart.value?.resize())
      ro.observe(node)

      mo = new MutationObserver(() => {
        themeTick.value++
      })
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
    },
    { immediate: true, flush: 'post' },
  )

  watchEffect(() => {
    // Track theme flips alongside the consumer's reactive deps.
    void themeTick.value
    apply()
  })

  onBeforeUnmount(() => {
    stopElWatch()
    ro?.disconnect()
    mo?.disconnect()
    chart.value?.dispose()
    chart.value = null
  })

  return { chart, themeTick }
}
