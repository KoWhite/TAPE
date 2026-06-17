import { defineStore } from 'pinia'
import type { MacroSeries, TacoIndex } from '@/types/macro'
import {
  fetchBuffettIndicator,
  fetchFredSeries,
  fetchShillerCape,
  fetchTacoIndex,
} from '@/api/macro'

interface CacheEntry {
  data: MacroSeries
  fetchedAt: number
}

/** 24h — FRED publishes daily/weekly/monthly. Daily refresh is plenty.
 *  Shiller CAPE is monthly, so the same TTL is overkill in the right
 *  direction (we always have <1mo-old data). */
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * Series whose values come from somewhere other than FRED. Adding a new
 * non-FRED source = add the id here + a fetcher in `fetchSeries()`.
 */
const NON_FRED_IDS: Record<string, (start?: string) => Promise<MacroSeries>> = {
  BUFFETT_ADJ_W5000: fetchBuffettIndicator,
  SHILLER_CAPE: () => fetchShillerCape(),
}

function fetchSeries(id: string, start?: string): Promise<MacroSeries> {
  const nonFred = NON_FRED_IDS[id]
  if (nonFred) return nonFred(start)
  return fetchFredSeries(id, start)
}

export const useMacroStore = defineStore(
  'macro',
  () => {
    const cache = ref<Record<string, CacheEntry>>({})
    const loading = ref<Record<string, boolean>>({})
    const errors = ref<Record<string, string | null>>({})
    const taco = ref<TacoIndex | null>(null)
    const tacoLoading = ref(false)
    const tacoError = ref<string | null>(null)
    const tacoFetchedAt = ref<number | null>(null)

    function isFresh(id: string): boolean {
      const entry = cache.value[id]
      return Boolean(entry) && Date.now() - entry.fetchedAt < TTL_MS
    }

    function get(id: string): MacroSeries | null {
      return cache.value[id]?.data ?? null
    }

    function fetchedAt(id: string): number | null {
      return cache.value[id]?.fetchedAt ?? null
    }

    async function load(
      id: string,
      opts: { start?: string; force?: boolean } = {},
    ): Promise<MacroSeries | null> {
      if (!opts.force && isFresh(id)) return cache.value[id].data
      loading.value = { ...loading.value, [id]: true }
      errors.value = { ...errors.value, [id]: null }
      try {
        const data = await fetchSeries(id, opts.start)
        cache.value = {
          ...cache.value,
          [id]: { data, fetchedAt: Date.now() },
        }
        return data
      } catch (e) {
        errors.value = { ...errors.value, [id]: (e as Error).message }
        return null
      } finally {
        loading.value = { ...loading.value, [id]: false }
      }
    }

    const tacoCacheKey = ref<string | null>(null)

    async function loadTaco(
      window = 20,
      opts: { start?: string; force?: boolean } = {},
    ): Promise<TacoIndex | null> {
      const cacheKey = `${window}:${opts.start ?? ''}`
      const fresh =
        taco.value &&
        tacoCacheKey.value === cacheKey &&
        tacoFetchedAt.value &&
        Date.now() - tacoFetchedAt.value < TTL_MS
      if (!opts.force && fresh) return taco.value

      tacoLoading.value = true
      tacoError.value = null
      try {
        const data = await fetchTacoIndex(window, opts.start)
        taco.value = data
        tacoFetchedAt.value = Date.now()
        tacoCacheKey.value = cacheKey
        return data
      } catch (e) {
        tacoError.value = (e as Error).message
        return null
      } finally {
        tacoLoading.value = false
      }
    }

    return {
      cache,
      loading,
      errors,
      taco,
      tacoLoading,
      tacoError,
      tacoFetchedAt,
      isFresh,
      get,
      fetchedAt,
      load,
      loadTaco,
    }
  },
  {
    persist: {
      key: 'tape:macro',
      pick: ['cache'],
    },
  },
)
