import { ref, watch, type Ref } from 'vue'

/**
 * Hold a value that only updates its reference when a cheap "fingerprint"
 * changes — not on every reactive tick of the source.
 *
 * The portfolio charts derive their data from `rows`, which recomputes on
 * every live-quote poll (every few seconds). Feeding that straight into
 * `useECharts` / `useHighcharts` re-runs `buildOption` — and Highcharts
 * destroys+recreates the whole chart — on each sub-cent price wiggle, which
 * is the source of the perceived jank.
 *
 * Wrapping the source here means the chart only rebuilds when the fingerprint
 * (e.g. holdings + rounded values) actually changes, so a price ticking from
 * 100.01 → 100.02 no longer repaints the chart, but adding a position or a
 * meaningful price move still does.
 */
export function useStableData<T>(source: () => T, fingerprint: (value: T) => string): Ref<T> {
  const stable = ref(source()) as Ref<T>
  let lastKey = fingerprint(stable.value)

  watch(
    () => fingerprint(source()),
    (key) => {
      if (key === lastKey) return
      lastKey = key
      stable.value = source()
    },
  )

  return stable
}
