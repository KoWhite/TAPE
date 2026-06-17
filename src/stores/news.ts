import { defineStore } from 'pinia'
import { fetchMarketNews, fetchTickerNews } from '@/api/news'
import type { NewsResponse } from '@/types/news'

interface CachedNews {
  data: NewsResponse
  fetchedAt: number
}

/** Bridge already serves a 5-min cache, so 5 min on the client is plenty —
 *  flipping between the watchlist and a detail page within that window
 *  reuses what we have. */
const TTL_MS = 5 * 60 * 1000

/**
 * News cache. Two flavors:
 *
 *   - per-ticker: keyed by `code`
 *   - market-wide: stored under a fixed `__market__` slot
 *
 * Both share the same TTL and the same in-flight dedup so duplicate calls
 * during component remounts don't fan out into multiple HTTP requests.
 */
export const useNewsStore = defineStore('news', () => {
  const cache = ref<Map<string, CachedNews>>(new Map())
  const inflight = ref<Set<string>>(new Set())
  const completed = ref<Record<string, number>>({})
  const lastError = ref<string | null>(null)

  function isFresh(key: string): boolean {
    const entry = cache.value.get(key)
    return Boolean(entry && Date.now() - entry.fetchedAt < TTL_MS)
  }

  function get(key: string): NewsResponse | null {
    return cache.value.get(key)?.data ?? null
  }

  function hasCompleted(key: string): boolean {
    return Boolean(completed.value[key] || cache.value.has(key))
  }

  async function loadTicker(code: string, force = false): Promise<void> {
    if (!code) return
    if (!force && isFresh(code)) {
      completed.value = { ...completed.value, [code]: Date.now() }
      return
    }
    if (inflight.value.has(code)) return
    inflight.value.add(code)
    try {
      const data = await fetchTickerNews(code)
      const next = new Map(cache.value)
      next.set(code, { data, fetchedAt: Date.now() })
      cache.value = next
      lastError.value = null
    } catch (e) {
      lastError.value = (e as Error).message
    } finally {
      completed.value = { ...completed.value, [code]: Date.now() }
      inflight.value.delete(code)
    }
  }

  async function loadMarket(force = false): Promise<void> {
    const key = '__market__'
    if (!force && isFresh(key)) {
      completed.value = { ...completed.value, [key]: Date.now() }
      return
    }
    if (inflight.value.has(key)) return
    inflight.value.add(key)
    try {
      const data = await fetchMarketNews()
      const next = new Map(cache.value)
      next.set(key, { data, fetchedAt: Date.now() })
      cache.value = next
      lastError.value = null
    } catch (e) {
      lastError.value = (e as Error).message
    } finally {
      completed.value = { ...completed.value, [key]: Date.now() }
      inflight.value.delete(key)
    }
  }

  function loadingFor(key: string): boolean {
    return inflight.value.has(key)
  }

  return {
    cache,
    completed,
    lastError,
    get,
    isFresh,
    hasCompleted,
    loadingFor,
    loadTicker,
    loadMarket,
  }
})
