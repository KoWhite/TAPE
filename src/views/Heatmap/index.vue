<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconLayoutGrid from '~icons/lucide/layout-grid'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import { useQuotes } from '@/composables/useQuotes'
import { useWatchlistStore } from '@/stores/watchlist'
import { useSectorsStore } from '@/stores/sectors'
import SectorTreemap, {
  type HeatmapLeaf,
} from './components/SectorTreemap.vue'
import { formatPercent } from '@/utils/format'

/**
 * Sector / industry heatmap. Reads the live watchlist + GLOBAL_TICKER_CODES
 * from `useQuotes`, joins them with the sector cache (yfinance-backed),
 * and renders an echarts treemap with tile size = market cap (or turnover
 * fallback) and tile color = day change pct.
 */

const { t } = useI18n()
const { list, refresh: refreshQuotes, loading } = useQuotes()
const watchlist = useWatchlistStore()
const sectors = useSectorsStore()

const codes = computed(() => list.value.map((q) => q.code))

onMounted(() => void sectors.loadMissing(codes.value))
watch(codes, (next) => void sectors.loadMissing(next))

const leaves = computed<HeatmapLeaf[]>(() =>
  list.value.map((q) => {
    const sec = sectors.get(q.code)
    return {
      code: q.code,
      symbol: q.symbol,
      changePct: q.changePct,
      // Prefer market cap (true visual weight); fall back to turnover, then 1.
      size: sec?.marketCap || q.turnover || 1,
      last: q.last,
      sector: sec?.sector || 'Unclassified',
      industry: sec?.industry,
    }
  }),
)

const aggregateByCount = computed(() => {
  const map = new Map<string, { count: number; ret: number; weight: number }>()
  for (const l of leaves.value) {
    const cur = map.get(l.sector) ?? { count: 0, ret: 0, weight: 0 }
    cur.count += 1
    cur.ret += l.changePct * l.size
    cur.weight += l.size
    map.set(l.sector, cur)
  }
  return [...map.entries()]
    .map(([sector, v]) => ({
      sector,
      count: v.count,
      avgRet: v.weight ? v.ret / v.weight : 0,
    }))
    .sort((a, b) => b.avgRet - a.avgRet)
})

function refreshAll(): void {
  void refreshQuotes()
  void sectors.loadMissing(codes.value, true)
}

const empty = computed(() => list.value.length === 0)
</script>

<template>
  <div class="space-y-6">
    <div class="flex-between flex-wrap gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <IconLayoutGrid class="size-5 text-[var(--tape-accent)]" />
          {{ t('heatmap.title') }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ t('heatmap.subtitle') }}
        </p>
      </div>
      <button
        class="btn-ghost h-8 px-3 text-xs"
        :disabled="loading"
        @click="refreshAll"
      >
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
        {{ t('heatmap.refresh') }}
      </button>
    </div>

    <article v-if="empty" class="surface p-12 text-center text-sm text-soft">
      {{ t('heatmap.empty') }}
    </article>

    <article v-else class="surface p-3 sm:p-4">
      <SectorTreemap :leaves="leaves" />
    </article>

    <article v-if="aggregateByCount.length" class="surface p-5 sm:p-6 space-y-3">
      <header class="flex items-center gap-2">
        <h3 class="text-sm font-semibold tracking-tight">{{ t('heatmap.summary') }}</h3>
        <span class="text-[10px] text-soft tracking-wider uppercase">
          {{ t('heatmap.weightedBy') }}
        </span>
      </header>
      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <li
          v-for="row in aggregateByCount"
          :key="row.sector"
          class="rounded-xl border border-[var(--tape-border)] px-3.5 py-2.5 flex items-center justify-between gap-3 hover:border-[var(--tape-border-hover)] transition-colors"
        >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold tracking-tight truncate">
              {{ row.sector }}
            </div>
            <div class="text-[10px] text-soft tracking-wider uppercase mt-0.5">
              {{ t('heatmap.tickers', row.count) }}
            </div>
          </div>
          <span
            class="text-mono text-sm font-semibold tabular-nums"
            :class="
              row.avgRet > 0
                ? 'text-[var(--tape-up)]'
                : row.avgRet < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatPercent(row.avgRet) }}
          </span>
        </li>
      </ul>
    </article>

    <p v-if="watchlist.items.length" class="text-[10px] text-soft text-center">
      {{ t('heatmap.footnote') }}
    </p>
  </div>
</template>
