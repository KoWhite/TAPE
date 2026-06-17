<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconFlame from '~icons/lucide/flame'
import IconLayoutGrid from '~icons/lucide/layout-grid'
import { useRouter } from 'vue-router'
import { useQuotes } from '@/composables/useQuotes'
import { fetchKline } from '@/api/kline'
import {
  direction,
  formatChange,
  formatCompact,
  formatNumber,
  formatPercent,
} from '@/utils/format'

const { t } = useI18n()
const { list } = useQuotes()
const router = useRouter()

interface PeriodOpt {
  id: string
  label: string
  /** Number of K_DAY bars to fetch -null means use the live Quote's 1D
   *  changePct directly without a K-line round-trip. */
  bars: number | null
}

const PERIODS: PeriodOpt[] = [
  { id: '1D', label: '1D', bars: null },
  { id: '5D', label: '5D', bars: 6 },
  { id: '1M', label: '1M', bars: 23 },
  { id: '3M', label: '3M', bars: 66 },
  { id: 'YTD', label: 'YTD', bars: 252 },
]

const period = ref<PeriodOpt>(PERIODS[0])

/** code -percentage return for the active period. Populated lazily when a
 *  multi-day period is picked. */
const klineReturns = ref<Map<string, number>>(new Map())
const klineLoading = ref(false)

async function loadKlineReturns(): Promise<void> {
  const p = period.value
  if (p.bars === null) {
    klineReturns.value = new Map()
    return
  }
  klineLoading.value = true
  const codes = list.value.map((q) => q.code)
  const next = new Map<string, number>()
  await Promise.all(
    codes.map(async (code) => {
      try {
        const res = await fetchKline({ code, ktype: 'K_DAY', count: p.bars! })
        const bars = res.bars
        if (bars.length < 2) return
        // YTD: find the first bar of the current year (or 'YTD' alias).
        let baseClose = bars[0].close
        if (p.id === 'YTD') {
          const year = new Date().getFullYear()
          const firstThisYear = bars.find((b) =>
            typeof b.time === 'string' && b.time.startsWith(`${year}-`),
          )
          if (firstThisYear) baseClose = firstThisYear.close
        }
        const lastClose = bars[bars.length - 1].close
        if (baseClose) next.set(code, lastClose / baseClose - 1)
      } catch {
        // Surface as missing in UI -don't block other tickers.
      }
    }),
  )
  klineReturns.value = next
  klineLoading.value = false
}

watch(period, () => void loadKlineReturns())
// Refresh when the watchlist itself changes -but only for non-1D periods.
watch(
  () => list.value.map((q) => q.code).join(','),
  () => {
    if (period.value.bars !== null) void loadKlineReturns()
  },
)
onMounted(() => {
  if (period.value.bars !== null) void loadKlineReturns()
})

interface MoverRow {
  code: string
  symbol: string
  last: number
  ret: number
  volume: number
  market: string
  hasReturn: boolean
}

const enriched = computed<MoverRow[]>(() => {
  const useKline = period.value.bars !== null
  return list.value.map((q) => {
    const ret = useKline ? klineReturns.value.get(q.code) : q.changePct
    return {
      code: q.code,
      symbol: q.symbol,
      last: q.last,
      ret: ret ?? 0,
      volume: q.volume,
      market: q.market,
      hasReturn: ret !== undefined,
    }
  })
})

const gainers = computed(() =>
  [...enriched.value]
    .filter((r) => r.hasReturn)
    .sort((a, b) => b.ret - a.ret)
    .slice(0, 5),
)
const losers = computed(() =>
  [...enriched.value]
    .filter((r) => r.hasReturn)
    .sort((a, b) => a.ret - b.ret)
    .slice(0, 5),
)
const mostActive = computed(() =>
  [...enriched.value].sort((a, b) => b.volume - a.volume).slice(0, 5),
)

const sections = computed(() => [
  { key: 'gainers', title: t('movers.topGainers'), icon: IconTrendingUp, items: gainers.value },
  { key: 'losers', title: t('movers.topLosers'), icon: IconTrendingDown, items: losers.value },
  { key: 'active', title: t('movers.mostActive'), icon: IconFlame, items: mostActive.value },
])

/** Heatmap data -sorted by absolute return magnitude so the strongest
 *  movers (either direction) sit near the top of the grid. */
const heatmap = computed(() =>
  [...enriched.value]
    .filter((r) => r.hasReturn)
    .sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret)),
)

/** Map a return into a color + opacity. Anything -0% caps at full intensity. */
function heatmapStyle(ret: number): Record<string, string> {
  const mag = Math.min(1, Math.abs(ret) / 0.1)
  const color = ret > 0 ? '34, 197, 94' : ret < 0 ? '239, 68, 68' : '107, 114, 128'
  // Background intensity scales with magnitude; baseline of 0.08 keeps even
  // tiny moves visible without becoming noise.
  const alpha = 0.08 + mag * 0.45
  return {
    background: `rgba(${color}, ${alpha})`,
    borderColor: `rgba(${color}, ${Math.min(1, 0.4 + mag * 0.5)})`,
  }
}

function openDetail(code: string): void {
  router.push(`/stock/${encodeURIComponent(code)}`)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex-between flex-wrap gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">
          {{ t('movers.title') }}
        </h2>
        <p class="text-sm text-muted mt-1">
          {{ t('movers.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-1 flex-wrap">
        <button
          v-for="p in PERIODS"
          :key="p.id"
          class="px-3 h-8 rounded-lg text-xs font-medium tracking-wide transition-colors"
          :class="
            period.id === p.id
              ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
              : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
          "
          :disabled="klineLoading"
          @click="period = p"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <!-- Top movers panels -->
    <div class="grid gap-4 lg:grid-cols-3">
      <section
        v-for="section in sections"
        :key="section.key"
        class="surface p-5"
      >
        <header class="flex items-center gap-2 mb-4">
          <component :is="section.icon" class="size-4 text-[var(--tape-accent)]" />
          <h3 class="font-semibold tracking-tight">{{ section.title }}</h3>
        </header>

        <ul v-if="section.items.length" class="divide-y divide-[var(--tape-border)]">
          <li
            v-for="(r, i) in section.items"
            :key="r.code"
            class="py-3 flex-between gap-3 cursor-pointer hover:bg-[var(--tape-surface-hover-bg)] -mx-2 px-2 rounded-lg transition-colors"
            @click="openDetail(r.code)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-soft text-xs w-4 text-mono">{{ i + 1 }}</span>
              <div class="min-w-0">
                <div class="text-sm font-semibold">{{ r.symbol }}</div>
                <div class="text-xs text-muted truncate">
                  {{ t('movers.vol', { value: formatCompact(r.volume) }) }}
                </div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-mono text-sm font-medium">
                {{ formatNumber(r.last) }}
              </div>
              <div
                class="text-mono text-xs"
                :class="{
                  'text-[var(--tape-up)]': direction(r.ret) === 'up',
                  'text-[var(--tape-down)]': direction(r.ret) === 'down',
                  'text-[var(--tape-text-soft)]': direction(r.ret) === 'flat',
                }"
              >
                {{ formatPercent(r.ret) }}
              </div>
            </div>
          </li>
        </ul>

        <p v-else class="text-sm text-muted py-6 text-center">
          {{ klineLoading ? t('movers.loading') : t('movers.noData') }}
        </p>
      </section>
    </div>

    <!-- Heatmap -visual scan of the whole watchlist -->
    <section class="surface p-5">
      <header class="flex items-center gap-2 mb-4">
        <IconLayoutGrid class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">{{ t('movers.heatmap') }}</h3>
        <span class="text-[10px] text-soft tracking-wider uppercase ml-2">
          {{ t('movers.heatmapMeta', { period: period.label, count: heatmap.length }) }}
        </span>
      </header>
      <div
        v-if="heatmap.length"
        class="grid gap-2"
        style="grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))"
      >
        <button
          v-for="r in heatmap"
          :key="r.code"
          class="rounded-lg border px-3 py-2.5 text-left transition-transform hover:scale-[1.03] cursor-pointer"
          :style="heatmapStyle(r.ret)"
          :title="`${r.symbol} · ${formatChange(r.ret)} · last ${formatNumber(r.last)}`"
          @click="openDetail(r.code)"
        >
          <div class="font-semibold text-sm tracking-tight truncate">
            {{ r.symbol }}
          </div>
          <div
            class="text-mono text-xs mt-0.5"
            :class="{
              'text-[var(--tape-up)]': direction(r.ret) === 'up',
              'text-[var(--tape-down)]': direction(r.ret) === 'down',
              'text-[var(--tape-text-soft)]': direction(r.ret) === 'flat',
            }"
          >
            {{ formatPercent(r.ret) }}
          </div>
        </button>
      </div>
      <p v-else class="text-sm text-muted py-6 text-center">
        {{ klineLoading ? 'Loading...' : 'No data yet.' }}
      </p>
    </section>
  </div>
</template>
