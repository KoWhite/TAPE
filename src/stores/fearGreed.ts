import { defineStore } from 'pinia'
import type { FearGreed } from '@/types/fearGreed'
import { fetchFearGreed } from '@/api/fearGreed'

/** Bridge already caches CNN's payload for 5 minutes. We keep a slightly
 *  longer client TTL (10m) so navigating between pages doesn't re-fetch. */
const TTL_MS = 10 * 60 * 1000

export const useFearGreedStore = defineStore(
  'fearGreed',
  () => {
    const data = ref<FearGreed | null>(null)
    const fetchedAt = ref<number | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    function isFresh(): boolean {
      return fetchedAt.value !== null && Date.now() - fetchedAt.value < TTL_MS
    }

    async function load(force = false): Promise<void> {
      if (!force && isFresh() && data.value) return
      loading.value = true
      error.value = null
      try {
        data.value = await fetchFearGreed()
        fetchedAt.value = Date.now()
      } catch (e) {
        error.value = (e as Error).message
      } finally {
        loading.value = false
      }
    }

    return { data, fetchedAt, loading, error, isFresh, load }
  },
  {
    persist: {
      key: 'tape:fearGreed',
      pick: ['data', 'fetchedAt'],
    },
  },
)
