import { defineStore } from 'pinia'
import { fetchSectors } from '@/api/sectors'
import type { SectorInfo } from '@/types/sector'

interface Cached {
  data: SectorInfo
  fetchedAt: number
}

/** Sector mapping is essentially static — the bridge caches for 24h and
 *  the persisted client cache below carries it across reloads. We use a
 *  short-ish in-memory TTL to bound the staleness without forcing a
 *  re-fetch on every page nav. */
const TTL_MS = 12 * 60 * 60 * 1000  // 12h

/**
 * Sector / industry / market-cap cache, keyed by Futu-style code.
 * Persisted to localStorage so the heatmap can render instantly on
 * subsequent visits without waiting on yfinance.
 */
export const useSectorsStore = defineStore(
  'sectors',
  () => {
    /** Plain object so the persist plugin's JSON serializer works. */
    const cache = ref<Record<string, Cached>>({})
    const inflight = ref<Set<string>>(new Set())
    const lastError = ref<string | null>(null)

    function get(code: string): SectorInfo | null {
      return cache.value[code]?.data ?? null
    }

    function isFresh(code: string): boolean {
      const entry = cache.value[code]
      return Boolean(entry && Date.now() - entry.fetchedAt < TTL_MS)
    }

    /** Fetch only the codes we don't have a fresh entry for, dedup'd against
     *  any in-flight request. */
    async function loadMissing(codes: string[], force = false): Promise<void> {
      const need = codes.filter(
        (c) => c && !inflight.value.has(c) && (force || !isFresh(c)),
      )
      if (need.length === 0) return
      need.forEach((c) => inflight.value.add(c))
      try {
        const res = await fetchSectors(need)
        const now = Date.now()
        const next = { ...cache.value }
        for (const code of need) {
          const data = res.results[code] ?? {
            sector: null,
            industry: null,
            marketCap: null,
          }
          next[code] = { data, fetchedAt: now }
        }
        cache.value = next
        lastError.value = null
      } catch (e) {
        lastError.value = (e as Error).message
      } finally {
        need.forEach((c) => inflight.value.delete(c))
      }
    }

    return { cache, lastError, get, isFresh, loadMissing }
  },
  {
    persist: {
      key: 'tape:sectors',
      pick: ['cache'],
    },
  },
)
