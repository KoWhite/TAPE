import { defineStore } from 'pinia'
import { fetchEarnings } from '@/api/earnings'
import type { EarningsRecord, EarningsReport } from '@/types/earnings'

interface CachedRecord {
  record: EarningsRecord | null
  fetchedAt: number
}

/** Estimate at the time we observed it as upcoming. Persisted across
 *  fetches so the post-release row can still display a beat/miss after
 *  yfinance rolls the calendar to the next quarter. */
interface EstimateSnapshot {
  date: string
  epsEstimate: number | null
  revenueEstimate: number | null
  /** When the snapshot was first taken — for debugging / pruning. */
  capturedAt: number
}

const TTL_MS = 12 * 60 * 60 * 1000
const SNAPSHOTS_PER_CODE = 8

/**
 * Earnings cache. yfinance is rate-sensitive and the data only changes a
 * few times a quarter, so we cache aggressively (12h TTL) and serve stale
 * entries instantly while refreshing in the background.
 *
 * Estimate snapshots: yfinance only retains the *current* upcoming
 * quarter's EPS / revenue consensus. Once the report drops and the
 * calendar rolls to the next quarter, we lose the estimate the analysts
 * had set. To preserve beat/miss after roll-over, we mirror every
 * upcoming `(date, epsEst, revEst)` we ever see into a per-code
 * `snapshots` map and merge the stored values back into history rows on
 * read.
 */
export const useEarningsStore = defineStore(
  'earnings',
  () => {
    const cache = ref<Map<string, CachedRecord>>(new Map())
    /** Per-code estimate snapshots. Plain object (not Map) so the Pinia
     *  persist plugin's JSON serializer can round-trip it. */
    const snapshots = ref<Record<string, EstimateSnapshot[]>>({})
    const inFlight = ref<Set<string>>(new Set())
    const completed = ref<Record<string, number>>({})
    const available = ref<boolean>(true)
    const lastError = ref<string | null>(null)

    function get(code: string): EarningsRecord | null {
      const r = cache.value.get(code)?.record ?? null
      if (!r) return r
      // Merge stored snapshots into history so beat/miss survives roll-over.
      const snaps = snapshots.value[code]
      if (!snaps?.length) return r
      const byDate = new Map(snaps.map((s) => [s.date, s]))
      const merged: EarningsReport[] = r.history.map((h) => {
        const snap = byDate.get(h.date)
        const revEst = h.revenueEstimate ?? snap?.revenueEstimate ?? null
        const epsEst = h.epsEstimate ?? snap?.epsEstimate ?? null
        const revAct = h.revenueActual ?? null
        const revSurprise =
          revEst != null && revEst !== 0 && revAct != null
            ? ((revAct / revEst) - 1) * 100
            : (h.revenueSurprisePct ?? null)
        return {
          ...h,
          epsEstimate: epsEst,
          revenueEstimate: revEst,
          revenueSurprisePct: revSurprise,
        }
      })
      return { ...r, history: merged }
    }

    function isStale(code: string): boolean {
      const e = cache.value.get(code)
      if (!e) return true
      return Date.now() - e.fetchedAt > TTL_MS
    }

    function hasCompleted(code: string): boolean {
      return Boolean(completed.value[code] || cache.value.has(code))
    }

    function loadingFor(code: string): boolean {
      return inFlight.value.has(code)
    }

    async function loadMissing(codes: string[]): Promise<void> {
      const now = Date.now()
      for (const c of codes) {
        if (cache.value.has(c) && !isStale(c)) {
          completed.value = { ...completed.value, [c]: now }
        }
      }
      const need = codes.filter(
        (c) => !inFlight.value.has(c) && (isStale(c) || !cache.value.has(c)),
      )
      if (need.length === 0) return
      await fetchAndStore(need)
    }

    /** Force refresh — bypasses the cache TTL. Use when the user explicitly
     *  asks for fresh data (e.g. clicking the Refresh button on the Earnings
     *  page) so we can pick up dates yfinance only just surfaced. */
    async function refresh(codes: string[]): Promise<void> {
      const need = codes.filter((c) => !inFlight.value.has(c))
      if (need.length === 0) return
      await fetchAndStore(need)
    }

    /** Capture the upcoming estimate for `code` so we can fall back to it
     *  later when yfinance has moved on. Idempotent — replaces an existing
     *  snapshot for the same date so re-fetches with refined estimates win. */
    function recordSnapshot(code: string, record: EarningsRecord): void {
      if (!record.nextDate) return
      const eps = record.nextEpsEstimate ?? null
      const rev = record.nextRevenueEstimate ?? null
      // Skip when both sides are null — there's nothing to remember.
      if (eps === null && rev === null) return
      const list = [...(snapshots.value[code] ?? [])]
      const idx = list.findIndex((s) => s.date === record.nextDate)
      const next: EstimateSnapshot = {
        date: record.nextDate,
        epsEstimate: eps,
        revenueEstimate: rev,
        capturedAt: Date.now(),
      }
      if (idx >= 0) list[idx] = next
      else list.unshift(next)
      list.sort((a, b) => b.date.localeCompare(a.date))
      const trimmed = list.slice(0, SNAPSHOTS_PER_CODE)
      snapshots.value = { ...snapshots.value, [code]: trimmed }
    }

    async function fetchAndStore(need: string[]): Promise<void> {
      need.forEach((c) => inFlight.value.add(c))
      try {
        const res = await fetchEarnings(need)
        available.value = res.available
        lastError.value = null
        const next = new Map(cache.value)
        const now = Date.now()
        for (const c of need) {
          const rec = res.results[c] ?? null
          next.set(c, { record: rec, fetchedAt: now })
          if (rec) recordSnapshot(c, rec)
        }
        cache.value = next
      } catch (e) {
        lastError.value = (e as Error).message
      } finally {
        const now = Date.now()
        const nextCompleted = { ...completed.value }
        need.forEach((c) => {
          nextCompleted[c] = now
        })
        completed.value = nextCompleted
        need.forEach((c) => inFlight.value.delete(c))
      }
    }

    /** Days until the next earnings date — null if unknown / past. */
    function daysUntil(code: string): number | null {
      const r = get(code)
      if (!r?.nextDate) return null
      const target = new Date(`${r.nextDate}T00:00:00Z`).getTime()
      const today = new Date()
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
      const diff = Math.round((target - todayUtc) / 86400000)
      return diff < 0 ? null : diff
    }

    return {
      cache,
      snapshots,
      completed,
      available,
      lastError,
        get,
        isStale,
        hasCompleted,
        loadingFor,
        loadMissing,
      refresh,
      daysUntil,
    }
  },
  {
    persist: {
      key: 'tape:earnings',
      pick: ['snapshots'],
    },
  },
)
