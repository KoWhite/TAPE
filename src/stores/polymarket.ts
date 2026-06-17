import { defineStore } from 'pinia'
import type { PolymarketTop } from '@/types/polymarket'
import { fetchPolymarketTop } from '@/api/polymarket'

/** Bridge caches for 5 minutes. Keep the client TTL identical so a Refresh
 *  click without `force` ends up as a no-op when the server cache is warm. */
const TTL_MS = 5 * 60 * 1000

export const usePolymarketStore = defineStore(
  'polymarket',
  () => {
    const data = ref<PolymarketTop | null>(null)
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
        data.value = await fetchPolymarketTop()
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
      key: 'tape:polymarket',
      pick: ['data', 'fetchedAt'],
    },
  },
)
