import { defineStore } from 'pinia'
import { fetchAnalyst } from '@/api/analyst'
import type { AnalystResponse } from '@/types/analyst'

interface Cached {
  data: AnalystResponse
  fetchedAt: number
}

/** Bridge caches for 1h. Keep the client TTL slightly shorter so a forced
 *  refresh from the bridge propagates within ~30 min of being triggered. */
const TTL_MS = 30 * 60 * 1000

export const useAnalystStore = defineStore('analyst', () => {
  const cache = ref<Map<string, Cached>>(new Map())
  const inflight = ref<Set<string>>(new Set())
  const lastError = ref<string | null>(null)

  function isFresh(code: string): boolean {
    const entry = cache.value.get(code)
    return Boolean(entry && Date.now() - entry.fetchedAt < TTL_MS)
  }

  function get(code: string): AnalystResponse | null {
    return cache.value.get(code)?.data ?? null
  }

  async function load(code: string, force = false): Promise<void> {
    if (!code) return
    if (!force && isFresh(code)) return
    if (inflight.value.has(code)) return
    inflight.value.add(code)
    try {
      const data = await fetchAnalyst(code)
      const next = new Map(cache.value)
      next.set(code, { data, fetchedAt: Date.now() })
      cache.value = next
      lastError.value = null
    } catch (e) {
      lastError.value = (e as Error).message
    } finally {
      inflight.value.delete(code)
    }
  }

  function loadingFor(code: string): boolean {
    return inflight.value.has(code)
  }

  return { cache, lastError, get, isFresh, load, loadingFor }
})
