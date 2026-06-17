import { storeToRefs } from 'pinia'
import { useQuotesStore } from '@/stores/quotes'

/**
 * Live quotes for the current watchlist. Backed by `useQuotesStore`, which is
 * a singleton — every caller (Dashboard, GlobalTicker, ...) shares one polling
 * cycle and one provider.fetchQuotes() call per tick.
 */
export function useQuotes() {
  const store = useQuotesStore()
  store.start()
  const {
    quotes,
    list,
    loading,
    error,
    lastSync,
    consecutiveFailures,
    nextRefreshAt,
  } = storeToRefs(store)
  return {
    quotes,
    list,
    loading,
    error,
    lastSync,
    consecutiveFailures,
    nextRefreshAt,
    refresh: store.refresh,
    retryNow: store.retryNow,
  }
}
