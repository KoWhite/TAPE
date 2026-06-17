<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchKline } from '@/api/kline'
import type { CompareSeries } from '@/components/kline/CompareChart.vue'
import { useWatchlistStore } from '@/stores/watchlist'
import type { KlineBar } from '@/types/kline'
import CompareChartPanel from './components/CompareChartPanel.vue'
import CompareErrorBanner from './components/CompareErrorBanner.vue'
import CompareHeader from './components/CompareHeader.vue'
import ComparePicker from './components/ComparePicker.vue'
import CompareSelectedChips from './components/CompareSelectedChips.vue'
import type { ComparePeriod, CompareRankedItem } from './types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const watchlist = useWatchlistStore()

const PERIODS: ComparePeriod[] = [
  { id: '1M', label: '1M', ktype: 'K_DAY', count: 30 },
  { id: '3M', label: '3M', ktype: 'K_DAY', count: 75 },
  { id: '6M', label: '6M', ktype: 'K_DAY', count: 150 },
  { id: '1Y', label: '1Y', ktype: 'K_DAY', count: 260 },
  { id: '5Y', label: '5Y', ktype: 'K_WEEK', count: 260 },
]

const COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#a855f7',
  '#06b6d4',
  '#ef4444',
  '#84cc16',
]

interface SeriesEntry {
  code: string
  symbol: string
  bars: KlineBar[]
  totalReturn: number
}

const period = ref<ComparePeriod>(PERIODS[2])
const selected = ref<string[]>([])
const seriesMap = ref<Map<string, SeriesEntry>>(new Map())
const loading = ref(false)
const errors = ref<Map<string, string>>(new Map())

onMounted(() => {
  if (selected.value.length === 0) {
    selected.value = watchlist.items.slice(0, 3).map((t) => t.code)
  }
})

async function loadOne(code: string): Promise<void> {
  errors.value.delete(code)
  try {
    const res = await fetchKline({
      code,
      ktype: period.value.ktype,
      count: period.value.count,
    })
    const bars = res.bars
    const sym = code.split('.').pop() || code
    const totalReturn =
      bars.length >= 2 && bars[0].close
        ? bars[bars.length - 1].close / bars[0].close - 1
        : 0
    const next = new Map(seriesMap.value)
    next.set(code, { code, symbol: sym, bars, totalReturn })
    seriesMap.value = next
  } catch (e) {
    errors.value.set(code, (e as Error).message)
  }
}

async function loadAll(): Promise<void> {
  loading.value = true
  const next = new Map<string, SeriesEntry>()
  for (const code of selected.value) {
    const existing = seriesMap.value.get(code)
    if (existing) next.set(code, existing)
  }
  seriesMap.value = next
  try {
    await Promise.all(selected.value.map((c) => loadOne(c)))
  } finally {
    loading.value = false
  }
}

watch(period, () => void loadAll())
watch(selected, (curr, prev) => {
  const prevSet = new Set(prev || [])
  const added = curr.filter((c) => !prevSet.has(c))
  const removed = (prev || []).filter((c) => !curr.includes(c))
  if (removed.length) {
    const next = new Map(seriesMap.value)
    for (const c of removed) next.delete(c)
    seriesMap.value = next
  }
  if (added.length) {
    loading.value = true
    Promise.all(added.map((c) => loadOne(c))).finally(() => {
      loading.value = false
    })
  }
})

onMounted(() => void loadAll())

function colorFor(code: string): string {
  const idx = selected.value.indexOf(code)
  return COLORS[idx >= 0 ? idx % COLORS.length : 0]
}

const chartSeries = computed<CompareSeries[]>(() =>
  selected.value
    .map((code) => {
      const entry = seriesMap.value.get(code)
      if (!entry || entry.bars.length === 0) return null
      return {
        code,
        symbol: entry.symbol,
        color: colorFor(code),
        bars: entry.bars,
      }
    })
    .filter((s): s is CompareSeries => s !== null),
)

const available = computed(() =>
  watchlist.items.filter((t) => !selected.value.includes(t.code)),
)

function toggle(code: string): void {
  if (selected.value.includes(code)) {
    selected.value = selected.value.filter((c) => c !== code)
    return
  }
  selected.value = [...selected.value, code]
}

function remove(code: string): void {
  selected.value = selected.value.filter((c) => c !== code)
}

const ranked = computed<CompareRankedItem[]>(() =>
  [...selected.value]
    .map((code) => {
      const entry = seriesMap.value.get(code)
      return {
        code,
        symbol: entry?.symbol ?? code.split('.').pop() ?? code,
        color: colorFor(code),
        ret: entry?.totalReturn ?? 0,
        loaded: Boolean(entry),
        error: errors.value.get(code),
      }
    })
    .sort((a, b) => b.ret - a.ret),
)
</script>

<template>
  <div class="space-y-4">
    <CompareHeader
      :periods="PERIODS"
      v-model:period="period"
      :loading="loading"
      @refresh="loadAll"
    />

    <CompareSelectedChips :items="ranked" @remove="remove" />

    <ComparePicker
      :available="available"
      :selected-count="selected.length"
      :max-selected="8"
      @toggle="toggle"
    />

    <CompareErrorBanner :errors="errors" />

    <CompareChartPanel :series="chartSeries" :loading="loading" />

    <p class="text-[10px] text-soft">
      {{ t('compare.footnote') }}
    </p>
  </div>
</template>
