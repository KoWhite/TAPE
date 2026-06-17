import { defineStore } from 'pinia'
import { fetchSectorEtfs } from '@/api/marketSectors'
import type { SectorEtfResponse } from '@/types/marketSector'

/** Bridge already caches for 60s. Keeping client TTL slightly longer
 *  (90s) prevents two visiting tabs from fanning out into duplicate
 *  requests right after a cache expiry. */
const TTL_MS = 90 * 1000

export const useMarketSectorsStore = defineStore('marketSectors', () => {
  const data = ref<SectorEtfResponse | null>(null)
  const fetchedAt = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  function isFresh(): boolean {
    return fetchedAt.value !== null && Date.now() - fetchedAt.value < TTL_MS
  }

  async function load(force = false): Promise<void> {
    if (!force && isFresh() && data.value) return
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      data.value = await fetchSectorEtfs()
      fetchedAt.value = Date.now()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  return { data, fetchedAt, loading, error, isFresh, load }
})
