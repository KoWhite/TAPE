import { defineStore } from 'pinia'
import { fetchInstitutionalContext } from '@/api/institutional'
import type { InstitutionalContext } from '@/types/institutional'

interface Cached {
  data: InstitutionalContext
  fetchedAt: number
  version: number
}

const TTL_MS = 12 * 60 * 60 * 1000
const CACHE_VERSION = 2

export const useInstitutionalStore = defineStore(
  'institutional',
  () => {
    const cache = ref<Record<string, Cached>>({})
    const inflight = ref<Set<string>>(new Set())
    const completed = ref<Record<string, number>>({})
    const lastError = ref<string | null>(null)

    function validEntry(code: string): Cached | null {
      const entry = cache.value[code]
      return entry?.version === CACHE_VERSION ? entry : null
    }

    function get(code: string): InstitutionalContext | null {
      return validEntry(code)?.data ?? null
    }

    function isFresh(code: string): boolean {
      const entry = validEntry(code)
      return Boolean(entry && Date.now() - entry.fetchedAt < TTL_MS)
    }

    function hasCompleted(code: string): boolean {
      return Boolean(completed.value[code] || validEntry(code))
    }

    async function load(code: string, force = false): Promise<void> {
      if (!code) return
      if (!force && isFresh(code)) {
        completed.value = { ...completed.value, [code]: Date.now() }
        return
      }
      if (inflight.value.has(code)) return
      inflight.value.add(code)
      try {
        const data = await fetchInstitutionalContext(code)
        cache.value = {
          ...cache.value,
          [code]: { data, fetchedAt: Date.now(), version: CACHE_VERSION },
        }
        lastError.value = null
      } catch (e) {
        lastError.value = (e as Error).message
      } finally {
        completed.value = { ...completed.value, [code]: Date.now() }
        inflight.value.delete(code)
      }
    }

    function loadingFor(code: string): boolean {
      return inflight.value.has(code)
    }

    return { cache, completed, lastError, get, isFresh, hasCompleted, load, loadingFor }
  },
  {
    persist: {
      key: 'tape:institutional',
      pick: ['cache'],
    },
  },
)
