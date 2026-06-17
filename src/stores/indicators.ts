import { defineStore } from 'pinia'
import { computeIndicator, fetchIndicatorCatalog } from '@/api/indicators'
import type {
  ComputeRequest,
  IndicatorMeta,
  IndicatorResult,
} from '@/types/indicator'

interface CachedResult {
  data: IndicatorResult
  fetchedAt: number
}

/** Bars don't change intraday-fast for daily K, so a 5-min cache covers
 *  re-renders when the user toggles indicators back and forth. The
 *  IndicatorLab view explicitly forces refresh via `refresh: true`. */
const RESULT_TTL_MS = 5 * 60 * 1000

/**
 * Indicator store. Holds:
 *  - The catalog (registry) — fetched once per session
 *  - A keyed cache of compute results — keyed by hash(req)
 *
 * Compute requests are deduplicated per cache key so flipping between
 * the same indicator+params doesn't fan out into duplicate HTTP calls.
 */
export const useIndicatorsStore = defineStore('indicators', () => {
  const catalog = ref<IndicatorMeta[]>([])
  const catalogLoaded = ref(false)
  const catalogError = ref<string | null>(null)
  const catalogLoading = ref(false)

  const results = ref<Map<string, CachedResult>>(new Map())
  const inflight = ref<Set<string>>(new Set())
  const computeError = ref<string | null>(null)

  // ── Catalog ───────────────────────────────────────────────────────
  async function loadCatalog(force = false): Promise<void> {
    if (!force && catalogLoaded.value) return
    if (catalogLoading.value) return
    catalogLoading.value = true
    catalogError.value = null
    try {
      const res = await fetchIndicatorCatalog()
      catalog.value = res.indicators
      catalogLoaded.value = true
    } catch (e) {
      catalogError.value = (e as Error).message
    } finally {
      catalogLoading.value = false
    }
  }

  /** Look up one indicator's metadata. Returns null if the catalog
   *  hasn't loaded yet or the id is unknown. */
  function meta(id: string): IndicatorMeta | null {
    return catalog.value.find((m) => m.id === id) ?? null
  }

  // ── Compute results ───────────────────────────────────────────────
  /** Hash a compute request to a stable string. Order-stable JSON keys
   *  via Object.entries().sort() — params object key order shouldn't
   *  affect cache identity. */
  function keyFor(req: ComputeRequest): string {
    const sortedParams = Object.entries(req.params ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',')
    return [
      req.code,
      req.ktype ?? 'K_DAY',
      req.count ?? 250,
      req.indicator,
      sortedParams,
    ].join('|')
  }

  function get(req: ComputeRequest): IndicatorResult | null {
    return results.value.get(keyFor(req))?.data ?? null
  }

  function isFresh(req: ComputeRequest): boolean {
    const entry = results.value.get(keyFor(req))
    return Boolean(entry && Date.now() - entry.fetchedAt < RESULT_TTL_MS)
  }

  function loadingFor(req: ComputeRequest): boolean {
    return inflight.value.has(keyFor(req))
  }

  async function ensure(req: ComputeRequest, force = false): Promise<void> {
    const key = keyFor(req)
    if (!force && isFresh(req)) return
    if (inflight.value.has(key)) return
    inflight.value.add(key)
    computeError.value = null
    try {
      const data = await computeIndicator(req)
      const next = new Map(results.value)
      next.set(key, { data, fetchedAt: Date.now() })
      results.value = next
    } catch (e) {
      computeError.value = (e as Error).message
    } finally {
      inflight.value.delete(key)
    }
  }

  return {
    catalog,
    catalogLoaded,
    catalogLoading,
    catalogError,
    computeError,
    loadCatalog,
    meta,
    get,
    isFresh,
    loadingFor,
    ensure,
    keyFor,
  }
})
