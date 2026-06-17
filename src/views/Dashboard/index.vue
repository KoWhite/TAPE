<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DashboardCategoryTabs from './components/DashboardCategoryTabs.vue'
import DashboardConnectionBanner from './components/DashboardConnectionBanner.vue'
import DashboardEmptyState from './components/DashboardEmptyState.vue'
import DashboardSortChips from './components/DashboardSortChips.vue'
import DashboardToolbar from './components/DashboardToolbar.vue'
import TickerCard from '@/components/ticker/TickerCard.vue'
import TickerRow from '@/components/ticker/TickerRow.vue'
import { useQuotes } from '@/composables/useQuotes'
import { useSettingsStore } from '@/stores/settings'
import { useWatchlistStore } from '@/stores/watchlist'
import { formatRelative } from '@/utils/format'
import { pickActiveSession } from '@/utils/session'
import type { Quote } from '@/types/stock'

const { t } = useI18n()
const watchlist = useWatchlistStore()
const settings = useSettingsStore()
const {
  list,
  loading,
  error,
  lastSync,
  consecutiveFailures,
  nextRefreshAt,
  refresh,
  retryNow,
} = useQuotes()

const tickClock = ref(Date.now())
let clockTimer: number | null = null
onMounted(() => {
  clockTimer = window.setInterval(() => (tickClock.value = Date.now()), 1000)
})
onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer)
})

type SortKey = 'symbol' | 'changePct' | 'last'

const sortKey = ref<SortKey>('changePct')
const sortDir = ref<'asc' | 'desc'>('desc')

const route = useRoute()
const router = useRouter()

/** Active category mirrors `?category=` so the main sidebar's nested
 *  Watchlist links can drive the page state, and so the user can deep-link
 *  / refresh on a filtered view. `null` = All; '__none__' = Uncategorized. */
const activeCategory = computed<string | null>({
  get: () => {
    const q = route.query.category
    if (typeof q !== 'string' || !q) return null
    return q
  },
  set: (val) => {
    const next = { ...route.query }
    if (val === null) delete next.category
    else next.category = val
    router.replace({ name: 'watchlist', query: next })
  },
})

const categoryTabs = computed(() => {
  const tabs: Array<{ id: string | null; name: string; color?: string; count: number }> = [
    { id: null, name: t('watchlist.all'), count: watchlist.items.length },
  ]
  for (const c of watchlist.categories) {
    tabs.push({
      id: c.id,
      name: c.name,
      color: c.color,
      count: watchlist.countsByCategory.get(c.id) ?? 0,
    })
  }
  const uncategorized = watchlist.countsByCategory.get('__none__') ?? 0
  if (uncategorized > 0 || watchlist.categories.length > 0) {
    tabs.push({ id: '__none__', name: t('watchlist.uncategorized'), count: uncategorized })
  }
  return tabs
})

watch(
  () => watchlist.categories.map((c) => c.id).join(','),
  () => {
    if (activeCategory.value && activeCategory.value !== '__none__') {
      const stillExists = watchlist.categories.some((c) => c.id === activeCategory.value)
      if (!stillExists) activeCategory.value = null
    }
  },
)

function sortValue(q: Quote, key: SortKey): number | string {
  if (key === 'symbol') return q.symbol
  if (settings.compactMode) {
    const s = pickActiveSession(q)
    return key === 'last' ? s.price : s.changePct
  }
  return q[key]
}

const categoryByCode = computed(() => {
  const m = new Map<string, string | undefined>()
  for (const t of watchlist.items) m.set(t.code, t.categoryId)
  return m
})

const filtered = computed(() => {
  const cat = activeCategory.value
  if (cat === null) return list.value
  if (cat === '__none__') {
    return list.value.filter((q) => !categoryByCode.value.get(q.code))
  }
  return list.value.filter((q) => categoryByCode.value.get(q.code) === cat)
})

const sorted = computed(() => {
  void tickClock.value
  const arr = [...filtered.value]
  const dir = sortDir.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    const av = sortValue(a, sortKey.value)
    const bv = sortValue(b, sortKey.value)
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
  return arr
})

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = key === 'symbol' ? 'asc' : 'desc'
}

const lastSyncLabel = computed(() =>
  lastSync.value
    ? formatRelative(lastSync.value.toISOString(), tickClock.value)
    : '--',
)

const retryInSeconds = computed(() => {
  if (consecutiveFailures.value === 0 || !nextRefreshAt.value) return null
  void tickClock.value
  const ms = nextRefreshAt.value.getTime() - Date.now()
  return ms > 0 ? Math.ceil(ms / 1000) : 0
})
</script>

<template>
  <div class="space-y-6">
    <DashboardToolbar
      :symbol-count="list.length"
      :loading="loading"
      :last-sync-label="lastSyncLabel"
      :compact-mode="settings.compactMode"
      :active-category-id="activeCategory"
      @toggle-compact="settings.compactMode = !settings.compactMode"
      @refresh="refresh"
    />

    <DashboardCategoryTabs
      :tabs="categoryTabs"
      :active-category="activeCategory"
      @select="activeCategory = $event"
    />

    <DashboardSortChips
      :sort-key="sortKey"
      :sort-dir="sortDir"
      @toggle="toggleSort"
    />

    <DashboardConnectionBanner
      v-if="error"
      :error="error"
      :consecutive-failures="consecutiveFailures"
      :retry-in-seconds="retryInSeconds"
      :loading="loading"
      @retry="retryNow"
    />

    <DashboardEmptyState
      v-if="!loading && sorted.length === 0 && list.length === 0"
      kind="empty-watchlist"
    />
    <DashboardEmptyState
      v-else-if="!loading && sorted.length === 0"
      kind="empty-category"
      @show-all="activeCategory = null"
    />

    <div v-else-if="settings.compactMode" class="flex flex-col gap-2">
      <TickerRow
        v-for="quote in sorted"
        :key="quote.code"
        :quote="quote"
        :clock-tick="tickClock"
        @remove="watchlist.remove(quote.symbol)"
      />
    </div>

    <div
      v-else
      class="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <TickerCard
        v-for="quote in sorted"
        :key="quote.code"
        :quote="quote"
        @remove="watchlist.remove(quote.symbol)"
      />
    </div>
  </div>
</template>
