import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, type Ref } from 'vue'

/**
 * Per-chart snapshot contract. Every Macro chart that wants its data fed
 * to the AI analyzer registers a `snapshot()` getter. The shape is
 * intentionally narrow — values, units, and a one-line description.
 * The AI doesn't need raw time series; it needs the *current state* plus
 * enough recent deltas to anchor commentary in numbers.
 *
 * Charts that have nothing to say (still loading, failed) return null
 * and are silently excluded.
 */
export interface ChartSnapshot {
  /** Stable id — first registration wins; later re-registers replace. */
  id: string
  /** Human-readable label for the AI's "facts" list. */
  label: string
  /** One-line description of what this chart shows. Pure context for the
   *  LLM — never shown to the user. */
  description: string
  /** Date (ISO yyyy-mm-dd) of the latest observation feeding this snapshot.
   *  The analyzer uses the max() across snapshots as the "as of" timestamp. */
  asOf?: string
  /** Concrete metrics. Stable shape so the prompt template stays the same
   *  as we add charts:
   *    - `label`:  e.g. "10Y yield"
   *    - `value`:  numeric current reading
   *    - `unit`:   "%" / "bp" / "$" / "" — drives prompt phrasing
   *    - `note`:   optional ("inverted by 32 bp", "vs 4.85% one month ago") */
  metrics: ChartMetric[]
}

export interface ChartMetric {
  label: string
  value: number | null
  unit?: string
  note?: string
}

/**
 * Snapshots are stored as functions, not values, so the AI card always
 * gets fresh data when the user clicks Analyze (charts update their
 * internal state as FRED data loads). The store keeps each registration
 * in a ref so reactive consumers can show e.g. a "5 charts ready" pill.
 */
type Provider = () => ChartSnapshot | null

export const useMacroAiContextStore = defineStore('macroAiContext', () => {
  const providers = ref<Map<string, Provider>>(new Map())

  function register(id: string, provider: Provider): () => void {
    const next = new Map(providers.value)
    next.set(id, provider)
    providers.value = next
    return () => {
      const after = new Map(providers.value)
      after.delete(id)
      providers.value = after
    }
  }

  /** Collect every registered chart's current snapshot. Drops nulls so
   *  charts in error/loading state don't pollute the prompt. */
  function collect(): ChartSnapshot[] {
    const out: ChartSnapshot[] = []
    for (const provider of providers.value.values()) {
      try {
        const snap = provider()
        if (snap && snap.metrics.length > 0) out.push(snap)
      } catch (e) {
        // A buggy snapshot getter shouldn't tank the whole payload.
        // eslint-disable-next-line no-console
        console.warn('[macroAi] snapshot provider threw:', e)
      }
    }
    return out
  }

  const registeredIds = computed(() => [...providers.value.keys()])

  return { register, collect, registeredIds }
})

/**
 * Sugar so a chart can register in one line:
 *
 *   useMacroAiContext({
 *     id: 'treasury-rates',
 *     getSnapshot: () => snapshotComputed.value,
 *   })
 *
 * Auto-unregisters when the chart's scope disposes (onScopeDispose), so
 * leaving the Macro page cleanly empties the provider table.
 */
export function useMacroAiContext(opts: {
  id: string
  /** Called each time the AI analyzer collects context. Return null when
   *  the chart has nothing useful yet (e.g. data still loading). */
  getSnapshot: () => ChartSnapshot | null
}): void {
  const store = useMacroAiContextStore()
  const unregister = store.register(opts.id, opts.getSnapshot)
  onScopeDispose(unregister)
}

/** Helper for chart components: turn a Ref<ChartSnapshot|null> into a
 *  getter suitable for `useMacroAiContext`. */
export function snapshotFromRef(
  r: Ref<ChartSnapshot | null>,
): () => ChartSnapshot | null {
  return () => r.value
}
