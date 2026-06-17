import { defineStore } from 'pinia'
import { fetchBacktestCatalog, runBacktest } from '@/api/backtests'
import type {
  BacktestRequest,
  BacktestResult,
  StrategyMeta,
} from '@/types/backtest'

interface CachedResult {
  data: BacktestResult
  fetchedAt: number
}

/** Backtest results don't drift fast — bars are daily, so a 10-min
 *  cache absorbs flipping between strategies/params without re-running
 *  the same compute. The view explicitly forces refresh on the user's
 *  Run button click. */
const RESULT_TTL_MS = 10 * 60 * 1000

/**
 * Backtest store. Two halves:
 *  - The strategy catalog (registry) — fetched once per session.
 *  - A cache of run results, keyed by the request hash.
 *
 * Compute requests are deduped per cache key so submit-spam doesn't
 * launch parallel runs of the same backtest.
 */
export const useBacktestsStore = defineStore('backtests', () => {
  const catalog = ref<StrategyMeta[]>([])
  const catalogLoaded = ref(false)
  const catalogError = ref<string | null>(null)
  const catalogLoading = ref(false)

  const results = ref<Map<string, CachedResult>>(new Map())
  const inflight = ref<Set<string>>(new Set())
  const lastError = ref<string | null>(null)
  const lastRunKey = ref<string | null>(null)

  async function loadCatalog(force = false): Promise<void> {
    if (!force && catalogLoaded.value) return
    if (catalogLoading.value) return
    catalogLoading.value = true
    catalogError.value = null
    try {
      const res = await fetchBacktestCatalog()
      catalog.value = res.strategies
      catalogLoaded.value = true
    } catch (e) {
      catalogError.value = (e as Error).message
    } finally {
      catalogLoading.value = false
    }
  }

  function meta(id: string): StrategyMeta | null {
    return catalog.value.find((m) => m.id === id) ?? null
  }

  /** Stable key for a request — same shape as indicators store so
   *  flipping between two equivalent requests reuses the cache. The
   *  `dsl` strategy threads a JSON object through `params.dsl`, so we
   *  serialize non-number values via JSON.stringify instead of `${v}`
   *  (which would collapse every dict to "[object Object]"). */
  function keyFor(req: BacktestRequest): string {
    const sortedParams = Object.entries(req.params ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v : JSON.stringify(v)}`)
      .join(',')
    return [
      req.strategyId,
      req.universe.join('+'),
      req.startDate ?? '',
      req.endDate ?? '',
      req.initialCapital ?? 10000,
      sortedParams,
    ].join('|')
  }

  function get(req: BacktestRequest): BacktestResult | null {
    return results.value.get(keyFor(req))?.data ?? null
  }

  function isFresh(req: BacktestRequest): boolean {
    const entry = results.value.get(keyFor(req))
    return Boolean(entry && Date.now() - entry.fetchedAt < RESULT_TTL_MS)
  }

  function loadingFor(req: BacktestRequest): boolean {
    return inflight.value.has(keyFor(req))
  }

  async function run(req: BacktestRequest, force = false): Promise<BacktestResult | null> {
    const key = keyFor(req)
    lastRunKey.value = key
    if (!force && isFresh(req)) {
      return get(req)
    }
    if (inflight.value.has(key)) return get(req)
    inflight.value.add(key)
    lastError.value = null
    try {
      const data = await runBacktest(req)
      const next = new Map(results.value)
      next.set(key, { data, fetchedAt: Date.now() })
      results.value = next
      return data
    } catch (e) {
      lastError.value = (e as Error).message
      return null
    } finally {
      inflight.value.delete(key)
    }
  }

  return {
    catalog,
    catalogLoaded,
    catalogLoading,
    catalogError,
    lastError,
    lastRunKey,
    loadCatalog,
    meta,
    keyFor,
    get,
    isFresh,
    loadingFor,
    run,
  }
})
