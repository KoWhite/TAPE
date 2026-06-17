<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import IconTarget from '~icons/lucide/target'
import IconUsers from '~icons/lucide/users'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import { useAnalystStore } from '@/stores/analyst'
import { formatNumber, formatPercent } from '@/utils/format'

interface Props {
  /** Frontend code, e.g. 'US.AAPL'. */
  code: string
  /** Live price for upside calculation. Falls back to provider's
   *  `priceTargets.current` when missing. */
  livePrice?: number
}

const props = defineProps<Props>()

const store = useAnalystStore()
const { cache } = storeToRefs(store)

onMounted(() => void store.load(props.code))
watch(() => props.code, (c) => void store.load(c))

const data = computed(() => cache.value.get(props.code)?.data ?? null)
const targets = computed(() => data.value?.priceTargets ?? null)

/** Reference price for the upside calc -prefer the live tape, fall back
 *  to whatever the analyst provider thinks "current" is. */
const referencePrice = computed(() => {
  if (props.livePrice && props.livePrice > 0) return props.livePrice
  return targets.value?.current ?? null
})

const upsidePct = computed(() => {
  const ref = referencePrice.value
  const median = targets.value?.median ?? targets.value?.mean ?? null
  if (!ref || !median) return null
  return median / ref - 1
})

/** Aggregate the most recent recommendation period (period === '0m'). */
const consensus = computed(() => {
  const rows = data.value?.recommendations ?? []
  if (!rows.length) return null
  const current = rows.find((r) => r.period === '0m') ?? rows[0]
  const total =
    current.strongBuy +
    current.buy +
    current.hold +
    current.sell +
    current.strongSell
  if (total === 0) return null
  return { ...current, total }
})

/** Map the recommendation distribution into a single 0- score where 0
 *  = unanimous strong sell and 4 = unanimous strong buy. Used to color
 *  the consensus pill. */
const consensusScore = computed(() => {
  const c = consensus.value
  if (!c) return null
  const weighted =
    c.strongBuy * 4 +
    c.buy * 3 +
    c.hold * 2 +
    c.sell * 1 +
    c.strongSell * 0
  return weighted / c.total
})

const consensusLabel = computed(() => {
  const s = consensusScore.value
  if (s == null) return '--'
  if (s >= 3.5) return 'Strong Buy'
  if (s >= 2.7) return 'Buy'
  if (s >= 1.7) return 'Hold'
  if (s >= 1.0) return 'Sell'
  return 'Strong Sell'
})

const consensusTone = computed(() => {
  const s = consensusScore.value
  if (s == null) return 'text-soft'
  if (s >= 3.0) return 'text-[var(--tape-up)]'
  if (s >= 2.0) return 'text-soft'
  return 'text-[var(--tape-down)]'
})

const upsideTone = computed(() => {
  const u = upsidePct.value
  if (u == null) return 'text-soft'
  if (u > 0.005) return 'text-[var(--tape-up)]'
  if (u < -0.005) return 'text-[var(--tape-down)]'
  return 'text-soft'
})

/** Distribution bar segments, normalized to 100%. Order matches the
 *  visual flow: Strong Buy -Strong Sell, left to right. */
const distSegments = computed(() => {
  const c = consensus.value
  if (!c) return []
  const segs: { key: string; pct: number; color: string; label: string }[] = [
    { key: 'strongBuy', pct: c.strongBuy / c.total, color: 'var(--tape-up)', label: 'Strong Buy' },
    { key: 'buy', pct: c.buy / c.total, color: '#84cc16', label: 'Buy' },
    { key: 'hold', pct: c.hold / c.total, color: 'var(--tape-text-soft)', label: 'Hold' },
    { key: 'sell', pct: c.sell / c.total, color: '#f97316', label: 'Sell' },
    { key: 'strongSell', pct: c.strongSell / c.total, color: 'var(--tape-down)', label: 'Strong Sell' },
  ]
  return segs.filter((s) => s.pct > 0)
})

const hasContent = computed(() => Boolean(targets.value || consensus.value))
</script>

<template>
  <article v-if="hasContent" class="surface p-4 sm:p-5 space-y-4">
    <header class="flex items-center gap-2">
      <IconTarget class="size-4 text-[var(--tape-accent)]" />
      <h3 class="text-sm font-semibold tracking-tight">Analyst Consensus</h3>
      <span class="text-[10px] text-soft tracking-wider uppercase">
        Yahoo Finance
      </span>
    </header>

    <!-- Price target ribbon -->
    <div v-if="targets" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-soft">Median Target</div>
        <div class="text-mono text-xl font-semibold tabular-nums mt-1">
          {{ targets.median != null ? formatNumber(targets.median) : '--' }}
        </div>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1">
          <component
            :is="(upsidePct ?? 0) >= 0 ? IconTrendingUp : IconTrendingDown"
            class="size-3"
          />
          Upside
        </div>
        <div
          class="text-mono text-xl font-semibold tabular-nums mt-1"
          :class="upsideTone"
        >
          {{ upsidePct != null ? formatPercent(upsidePct) : '--' }}
        </div>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wider text-soft">Range</div>
        <div class="text-mono text-sm tabular-nums mt-1.5 text-soft">
          <span v-if="targets.low != null">{{ formatNumber(targets.low) }}</span>
          <span v-else>--</span>
          <span class="mx-1.5">--</span>
          <span v-if="targets.high != null">{{ formatNumber(targets.high) }}</span>
          <span v-else>--</span>
        </div>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wider text-soft">Mean</div>
        <div class="text-mono text-sm tabular-nums mt-1.5 text-soft">
          {{ targets.mean != null ? formatNumber(targets.mean) : '--' }}
        </div>
      </div>
    </div>

    <!-- Range bar visualizing low/median/high vs current price -->
    <div v-if="targets && targets.low != null && targets.high != null && targets.high > targets.low" class="space-y-1.5">
      <div class="relative h-2 rounded-full bg-[var(--tape-surface-hover-bg)] overflow-visible">
        <!-- Median marker -->
        <div
          v-if="targets.median != null"
          class="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-[var(--tape-accent)] border-2 border-[var(--tape-bg-elev)] z-10"
          :style="{
            left: `${Math.max(0, Math.min(100, ((targets.median - targets.low) / (targets.high - targets.low)) * 100))}%`,
            transform: 'translate(-50%, -50%)',
          }"
          :title="`Median ${formatNumber(targets.median)}`"
        />
        <!-- Current marker -->
        <div
          v-if="referencePrice != null"
          class="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--tape-text)] z-10"
          :style="{
            left: `${Math.max(0, Math.min(100, ((referencePrice - targets.low) / (targets.high - targets.low)) * 100))}%`,
          }"
          :title="`Current ${formatNumber(referencePrice)}`"
        />
      </div>
      <div class="flex justify-between text-[10px] text-soft text-mono tabular-nums">
        <span>Low {{ formatNumber(targets.low) }}</span>
        <span>High {{ formatNumber(targets.high) }}</span>
      </div>
    </div>

    <!-- Recommendation distribution -->
    <div
      v-if="consensus"
      class="pt-3 border-t border-[var(--tape-border)] space-y-2.5"
    >
      <div class="flex-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <IconUsers class="size-3.5 text-soft" />
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ consensus.total }} analyst{{ consensus.total === 1 ? '' : 's' }}
          </span>
        </div>
        <div class="text-mono text-sm font-semibold tracking-tight" :class="consensusTone">
          {{ consensusLabel }}
        </div>
      </div>

      <div class="flex h-2 rounded-full overflow-hidden bg-[var(--tape-surface-hover-bg)]">
        <div
          v-for="seg in distSegments"
          :key="seg.key"
          :title="`${seg.label}: ${Math.round(seg.pct * 100)}%`"
          class="h-full transition-all"
          :style="{
            width: (seg.pct * 100) + '%',
            backgroundColor: seg.color,
          }"
        />
      </div>

      <div class="grid grid-cols-5 gap-1 text-[10px] text-mono tabular-nums text-soft text-center">
        <div title="Strong Buy">SB · {{ consensus.strongBuy }}</div>
        <div title="Buy">B · {{ consensus.buy }}</div>
        <div title="Hold">H · {{ consensus.hold }}</div>
        <div title="Sell">S · {{ consensus.sell }}</div>
        <div title="Strong Sell">SS · {{ consensus.strongSell }}</div>
      </div>
    </div>
  </article>
</template>
