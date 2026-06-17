import { onBeforeUnmount, ref, watch, watchEffect, type Ref } from 'vue'
import type Highcharts from 'highcharts'
// Highstock includes the stockChart constructor used by the macro and
// portfolio views. Use the readable `.src` bundle because Rollup's commonjs
// resolver can choke on Highcharts' minified UMD wrapper in production builds.
import HighchartsRuntime from 'highcharts/highstock.src'

type ChartInstance = Highcharts.Chart
interface UseHighchartsOptions {
  constructor?: 'chart' | 'stockChart'
}

/**
 * Mount a Highcharts instance on `el` and rebuild it whenever
 * `buildOptions()` deps change. Also rebuilds on:
 *   - container resize (ResizeObserver → chart.reflow)
 *   - <html> class change (MutationObserver) — covers dark-mode toggling
 *
 * We rebuild rather than `chart.update` because theme changes touch nearly
 * every option (axis colors, tooltip bg, gradient stops); destroy+recreate
 * is simpler and Highcharts is fast enough at that scale.
 */
export function useHighcharts(
  el: Ref<HTMLElement | null>,
  buildOptions: () => Highcharts.Options | null,
  options?: UseHighchartsOptions,
) {
  const chart = ref<ChartInstance | null>(null)
  const themeTick = ref(0)

  let ro: ResizeObserver | null = null
  let mo: MutationObserver | null = null

  function rebuild() {
    chart.value?.destroy()
    chart.value = null
    if (!el.value) return
    const opts = buildOptions()
    if (!opts) return
    const runtime = HighchartsRuntime as unknown as {
      chart: (el: HTMLElement, opts: Highcharts.Options) => Highcharts.Chart
      stockChart: (el: HTMLElement, opts: Highcharts.Options) => Highcharts.Chart
    }
    const ctor = options?.constructor === 'stockChart' ? runtime.stockChart : runtime.chart
    chart.value = ctor(el.value, opts)
  }

  const stopElWatch = watch(
    el,
    (node, _old, onCleanup) => {
      if (!node) return
      ro = new ResizeObserver(() => chart.value?.reflow())
      ro.observe(node)
      mo = new MutationObserver(() => {
        themeTick.value++
      })
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      onCleanup(() => {
        ro?.disconnect()
        mo?.disconnect()
        ro = null
        mo = null
      })
    },
    { immediate: true, flush: 'post' },
  )

  watchEffect(
    () => {
      // Theme dep + buildOptions reactive deps tracked inside rebuild().
      void themeTick.value
      rebuild()
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    stopElWatch()
    ro?.disconnect()
    mo?.disconnect()
    chart.value?.destroy()
    chart.value = null
  })

  return { chart, themeTick }
}
