<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IconChartPie from '~icons/lucide/chart-pie'
import { useRouter } from 'vue-router'
import { useSectorsStore } from '@/stores/sectors'
import { useStableData } from '@/composables/useStableData'
import { computeBreakdown, type BreakdownBasis, type ConcentrationLevel, type PortfolioBreakdown } from '@/utils/portfolioBreakdown'
import type { PortfolioRow } from '../types'
import PortfolioAllocationPie from './PortfolioAllocationPie.vue'
import PortfolioPnlAttribution from './PortfolioPnlAttribution.vue'
import PortfolioHealthTable from './PortfolioHealthTable.vue'

const props = defineProps<{
  rows: PortfolioRow[]
}>()

const router = useRouter()
const sectors = useSectorsStore()
const basis = ref<BreakdownBasis>('sector')

/** Priced holdings only — these are what the breakdown actually aggregates. */
const pricedRows = computed(() => props.rows.filter((r) => r.hasQuote && r.value > 0))

/** Pull sector mappings for every held code; the store dedupes and caches, so
 *  re-running on row changes is cheap. Breakdown recomputes reactively once
 *  the fetch lands because `computeBreakdown` reads `sectors.get`. */
watch(
  () => pricedRows.value.map((r) => r.code),
  (codes) => {
    if (codes.length) void sectors.loadMissing(codes)
  },
  { immediate: true },
)

const rawBreakdown = computed<PortfolioBreakdown>(() =>
  computeBreakdown(pricedRows.value, basis.value, (code) => sectors.get(code)?.sector),
)

/** Only re-feed the charts when the structure or a rounded value actually
 *  moves — sub-dollar quote wiggles every poll cycle would otherwise destroy
 *  and rebuild the charts continuously. Basis switch and real moves still pass
 *  through because they change the fingerprint. */
const breakdown = useStableData(
  () => rawBreakdown.value,
  (b) =>
    basis.value +
    '|' +
    b.groups.map((g) => `${g.key}:${Math.round(g.value)}:${Math.round(g.unrealizedPnl)}`).join(','),
)

const LEVEL_META: Record<ConcentrationLevel, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'text-[var(--tape-up)]' },
  medium: { label: 'Medium', cls: 'text-[var(--tape-warn)]' },
  high: { label: 'High', cls: 'text-[var(--tape-down)]' },
}

const concentration = computed(() => breakdown.value.concentration)
const levelMeta = computed(() => LEVEL_META[concentration.value.level])

const TABS: { value: BreakdownBasis; label: string }[] = [
  { value: 'sector', label: 'By Sector' },
  { value: 'market', label: 'By Market' },
  { value: 'symbol', label: 'By Holding' },
]

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function openDetail(code: string): void {
  router.push(`/stock/${encodeURIComponent(code)}`)
}
</script>

<template>
  <article v-if="pricedRows.length" class="surface overflow-hidden">
    <header class="px-4 py-3 border-b border-[var(--tape-border)] flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <IconChartPie class="size-4 text-[var(--tape-accent)] shrink-0" />
        <h3 class="font-semibold tracking-tight">Holdings Breakdown</h3>
      </div>
      <div class="ml-auto flex items-center gap-1 rounded-lg bg-[var(--tape-button-bg)] p-0.5">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          class="h-7 px-3 text-xs rounded-md transition-colors"
          :class="basis === tab.value
            ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
            : 'text-soft hover:text-[var(--tape-text)]'"
          @click="basis = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </header>

    <div class="p-4 space-y-5">
      <!-- ① Allocation + concentration -->
      <section class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
        <PortfolioAllocationPie :groups="breakdown.groups" />
        <div class="grid grid-cols-3 lg:grid-cols-1 gap-2 lg:w-44">
          <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-soft">Top 1</div>
            <div class="text-mono text-lg font-semibold mt-0.5">{{ pct(concentration.top1) }}</div>
          </div>
          <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-soft">Top 3</div>
            <div class="text-mono text-lg font-semibold mt-0.5">{{ pct(concentration.top3) }}</div>
          </div>
          <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
            <div class="text-[10px] uppercase tracking-wider text-soft">Concentration</div>
            <div class="text-lg font-semibold mt-0.5" :class="levelMeta.cls">{{ levelMeta.label }}</div>
            <div class="text-[10px] text-soft text-mono">HHI {{ concentration.hhi.toFixed(3) }}</div>
          </div>
        </div>
      </section>

      <!-- ② P&L attribution -->
      <section>
        <div class="text-[10px] uppercase tracking-wider text-soft mb-1">Unrealized P&L Attribution</div>
        <PortfolioPnlAttribution :groups="breakdown.groups" />
      </section>

      <!-- ③ Per-holding health check -->
      <section>
        <div class="text-[10px] uppercase tracking-wider text-soft mb-2">Per-Holding Check</div>
        <PortfolioHealthTable :rows="pricedRows" @open="openDetail" />
      </section>
    </div>
  </article>
</template>
