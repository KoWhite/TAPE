import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getProvider } from '@/api'
import type { Quote } from '@/types/stock'
import { useWatchlistStore } from './watchlist'
import { useSettingsStore } from './settings'
import { usePortfolioStore } from './portfolio'
import { usePortfolioHistoryStore } from './portfolioHistory'
import { useAlertsStore } from './alerts'
import { useEarningsStore } from './earnings'

/**
 * Codes that drive the global ticker strip. Always fetched alongside the
 * watchlist so we issue a single provider.fetchQuotes() round-trip per cycle.
 *
 * Futu code conventions:
 *   - US indices use double-dot (US..DJI). Single-dot would be parsed as a
 *     normal stock symbol and rejected by get_market_snapshot.
 *   - HK index uses HK.800000 (HSI), CN uses SH.000001 (Shanghai Composite).
 *   - Japan isn't in the bridge's market map, so we proxy Japanese equities with EWJ.
 */
export const GLOBAL_TICKER_CODES = [
  'US.SPY',
  'US.QQQ',
  // 'US..DJI',
  // 'US..IXIC',
  // 'US..SPX',
  // 'US..VIX',
  'HK.800000',
  'SH.000001',
  'US.EWJ',
  'US.GLD',
  'US.USO',
] as const

const MAX_BACKOFF_MS = 60_000

export const useQuotesStore = defineStore('quotes', () => {
  const watchlist = useWatchlistStore()
  const settings = useSettingsStore()
  const portfolio = usePortfolioStore()
  const portfolioHistory = usePortfolioHistoryStore()
  const alerts = useAlertsStore()
  const earnings = useEarningsStore()
  const { codes: watchlistCodes } = storeToRefs(watchlist)
  const { positions } = storeToRefs(portfolio)

  const quotes = ref<Map<string, Quote>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastSync = ref<Date | null>(null)
  /** Number of consecutive failed refreshes — drives the backoff schedule. */
  const consecutiveFailures = ref(0)
  /** When the next refresh is scheduled to run. Used by the UI to show a
   *  "retrying in Xs" countdown when the bridge is unreachable. */
  const nextRefreshAt = ref<Date | null>(null)

  /** Watchlist ∪ portfolio ∪ global ticker codes — deduplicated and sorted
   *  so the array identity is stable when the contents don't change. Without
   *  the sort, set iteration order can vary across reruns and any watch on
   *  `allCodes` would re-fire spuriously, causing `bind()` to tear down and
   *  rebuild the polling loop on every refresh. Portfolio codes are needed
   *  for live P&L; otherwise an off-watchlist holding would never get its
   *  quote refreshed. */
  const allCodes = computed(() => {
    const set = new Set<string>(watchlistCodes.value)
    for (const code of GLOBAL_TICKER_CODES) set.add(code)
    for (const p of positions.value) set.add(p.code)
    return [...set].sort()
  })
  /** Stable string key for watchers — change-detection works on primitive
   *  equality, not array identity. */
  const allCodesKey = computed(() => allCodes.value.join('|'))

  let unsubscribe: (() => void) | null = null
  let pollTimer: number | null = null
  let inflight: AbortController | null = null
  /** Promise of the currently-running refresh, if any. Multiple components
   *  mounting in the same tick all call refresh(); we want exactly one
   *  network round-trip to happen, with the rest awaiting the same promise.
   *  AbortController on its own only cancels prior requests after the new
   *  one starts — it can't dedupe simultaneous calls. */
  let inflightPromise: Promise<void> | null = null
  let started = false
  /** Tracks whether the polling loop is currently paused because the tab is
   *  hidden. We don't burn API calls on a tab the user can't see — the
   *  visibility listener flips this on `visibilitychange`. */
  let paused = false

  function applyTick(q: Quote): void {
    const next = new Map(quotes.value)
    next.set(q.code, q)
    quotes.value = next
    lastSync.value = new Date()
    alerts.check(quotes.value)
  }

  function backoffMs(): number {
    if (consecutiveFailures.value === 0) return settings.refreshInterval
    const exp = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** consecutiveFailures.value)
    return Math.max(settings.refreshInterval, exp)
  }

  function refresh(): Promise<void> {
    // Dedupe: callers that arrive while a refresh is in-flight share that
    // promise instead of starting a second round-trip. The polling loop and
    // ad-hoc UI refresh buttons both go through here.
    if (inflightPromise) return inflightPromise
    if (allCodes.value.length === 0) {
      quotes.value = new Map()
      return Promise.resolve()
    }
    // No in-flight at this point (inflightPromise is null, so refresh() has
    // exited and the finally block cleared `inflight`). New AbortController
    // for this round-trip; bind()/teardown() can still abort it externally.
    const ctrl = new AbortController()
    inflight = ctrl

    loading.value = true
    const run = (async () => {
      try {
        const provider = getProvider()
        const data = await provider.fetchQuotes(allCodes.value, ctrl.signal)
        if (ctrl.signal.aborted) return
        const next = new Map<string, Quote>()
        data.forEach((q) => next.set(q.code, q))
        quotes.value = next
        lastSync.value = new Date()
        error.value = null
        consecutiveFailures.value = 0
        alerts.check(quotes.value)
        portfolioHistory.maybeSnapshot(quotes.value)
        // Background fetch — only for things the user actually owns or watches.
        // Skip GLOBAL_TICKER_CODES (broad ETFs and indices that never have
        // earnings); querying them just wastes a yfinance round-trip per ticker.
        const globals = new Set<string>(GLOBAL_TICKER_CODES)
        const earningsCodes = allCodes.value.filter((c) => !globals.has(c))
        void earnings.loadMissing(earningsCodes)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        error.value = (e as Error).message
        consecutiveFailures.value += 1
      } finally {
        if (inflight === ctrl) inflight = null
        loading.value = false
        inflightPromise = null
      }
    })()
    inflightPromise = run
    return run
  }

  function teardown(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    if (pollTimer) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
    inflight?.abort()
    inflight = null
    inflightPromise = null
    nextRefreshAt.value = null
  }

  /** Self-rescheduling poll loop. We use setTimeout (not setInterval) so the
   *  delay can grow with `backoffMs()` after failures and shrink back to the
   *  configured interval on success. */
  function scheduleNext(): void {
    if (pollTimer) window.clearTimeout(pollTimer)
    if (paused) {
      pollTimer = null
      nextRefreshAt.value = null
      return
    }
    const delay = backoffMs()
    nextRefreshAt.value = new Date(Date.now() + delay)
    pollTimer = window.setTimeout(async () => {
      await refresh()
      // Always reschedule — failure path is handled via backoff in backoffMs.
      if (pollTimer !== null && !paused) scheduleNext()
    }, delay)
  }

  /** Browser tab visibility hook. Polling is the default path (the bridge
   *  provider has no `subscribe`), so when the tab is hidden we cancel
   *  in-flight requests and stop scheduling new ones. Coming back to the tab
   *  triggers an immediate refresh so the UI doesn't show stale data. */
  function onVisibilityChange(): void {
    const hidden = typeof document !== 'undefined' && document.hidden
    if (hidden && !paused) {
      paused = true
      inflight?.abort()
      if (pollTimer) {
        window.clearTimeout(pollTimer)
        pollTimer = null
      }
      nextRefreshAt.value = null
    } else if (!hidden && paused) {
      paused = false
      // Subscribe path doesn't need an immediate kick — its push stream
      // resumes naturally. For polling, force a refresh + new schedule.
      if (!unsubscribe) {
        void (async () => {
          await refresh()
          if (!paused) scheduleNext()
        })()
      }
    }
  }

  function bind(): void {
    teardown()
    if (allCodes.value.length === 0) return

    const provider = getProvider()
    if (provider.subscribe) {
      unsubscribe = provider.subscribe(allCodes.value, applyTick)
    } else {
      scheduleNext()
    }
  }

  function retryNow(): void {
    consecutiveFailures.value = 0
    bind()
    void refresh()
  }

  /** Idempotent — first caller wires up the polling/subscription watcher. */
  function start(): void {
    if (started) return
    started = true
    if (typeof document !== 'undefined') {
      paused = document.hidden
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    watch(
      [
        allCodesKey,
        () => settings.dataSource,
        () => settings.refreshInterval,
        () => settings.bridge.baseUrl,
      ],
      async () => {
        consecutiveFailures.value = 0
        // Don't burn a request if the tab launched hidden — the visibility
        // listener will kick a refresh when the user comes back.
        if (!paused) await refresh()
        bind()
      },
      { immediate: true },
    )
  }

  /** Quote list for the watchlist, in watchlist order. */
  const list = computed(() =>
    watchlistCodes.value
      .map((code) => quotes.value.get(code))
      .filter((q): q is Quote => Boolean(q)),
  )

  return {
    quotes,
    loading,
    error,
    lastSync,
    list,
    consecutiveFailures,
    nextRefreshAt,
    refresh,
    retryNow,
    start,
  }
})
