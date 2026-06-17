<script setup lang="ts">
import { computed } from 'vue'
import IconScale from '~icons/lucide/scale'
import IconArrowUpRight from '~icons/lucide/arrow-up-right'
import IconArrowDownRight from '~icons/lucide/arrow-down-right'
import { formatPercent } from '@/utils/format'
import type { PortfolioRow } from '../types'

const props = defineProps<{
  rows: PortfolioRow[]
  /** Total portfolio market value, drives the target-value math. */
  totalValue: number
  /** Drift below this fraction is shown as "balanced" and suggests no trade. */
  threshold?: number
}>()

defineEmits<{
  /** Pre-fill the trade modal with mode=buy|sell, code, and suggested shares. */
  trade: [payload: { code: string; symbol: string; mode: 'buy' | 'sell'; shares: number }]
}>()

const threshold = computed(() => props.threshold ?? 0.005)

interface RebalanceItem {
  code: string
  symbol: string
  current: number
  target: number
  drift: number
  /** Positive = need to buy, negative = need to sell. In USD. */
  delta: number
  /** Suggested share count (positive integer); 0 when no quote / no action. */
  shares: number
  last: number
  status: 'buy' | 'sell' | 'balanced' | 'no-quote'
}

const items = computed<RebalanceItem[]>(() => {
  return props.rows
    .filter((r) => typeof r.targetWeight === 'number' && r.targetWeight > 0)
    .map((r) => {
      const target = r.targetWeight ?? 0
      const targetValue = props.totalValue * target
      const delta = targetValue - r.value
      const drift = target ? (r.weight - target) / target : 0
      let status: RebalanceItem['status'] = 'balanced'
      let shares = 0
      if (!r.hasQuote || r.last <= 0) {
        status = 'no-quote'
      } else if (Math.abs(drift) < threshold.value) {
        status = 'balanced'
      } else if (delta > 0) {
        status = 'buy'
        shares = Math.max(1, Math.round(delta / r.last))
      } else {
        status = 'sell'
        // Round toward zero so we never recommend selling more than we own.
        const raw = Math.round(Math.abs(delta) / r.last)
        shares = Math.min(r.shares, Math.max(1, raw))
      }
      return {
        code: r.code,
        symbol: r.symbol,
        current: r.weight,
        target,
        drift,
        delta,
        shares,
        last: r.last,
        status,
      }
    })
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
})

const actionable = computed(() => items.value.filter((i) => i.status === 'buy' || i.status === 'sell'))
const balanced = computed(() => items.value.filter((i) => i.status === 'balanced').length)
const missingQuote = computed(() => items.value.filter((i) => i.status === 'no-quote').length)

const targetSum = computed(() => items.value.reduce((s, i) => s + i.target, 0))
const targetSumWarning = computed(() => items.value.length > 0 && Math.abs(targetSum.value - 1) > 0.01)

function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  const formatted = abs >= 1000 ? abs.toFixed(0) : abs.toFixed(2)
  return `${n < 0 ? '-' : ''}$${formatted}`
}
</script>

<template>
  <article v-if="items.length > 0" class="surface p-4 space-y-3">
    <header class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="size-7 rounded-md bg-[var(--tape-button-bg)] flex-center text-soft">
          <IconScale class="size-3.5" />
        </span>
        <div>
          <div class="text-sm font-semibold">Rebalance</div>
          <div class="text-[11px] text-soft">
            {{ items.length }} target{{ items.length === 1 ? '' : 's' }}
            <span v-if="balanced > 0"> · {{ balanced }} balanced</span>
            <span v-if="missingQuote > 0"> · {{ missingQuote }} waiting on quote</span>
          </div>
        </div>
      </div>
      <div
        v-if="targetSumWarning"
        class="text-[11px] px-2 py-0.5 rounded-md bg-[var(--tape-button-bg)] text-soft"
        :title="`Target weights sum to ${(targetSum * 100).toFixed(1)}% — usually you want 100%.`"
      >
        Σ {{ (targetSum * 100).toFixed(1) }}%
      </div>
    </header>

    <div v-if="actionable.length === 0" class="text-[12px] text-soft py-1">
      All targets are within {{ formatPercent(threshold) }} of current weights — nothing to do.
    </div>

    <ul v-else class="divide-y divide-[var(--tape-border)]">
      <li
        v-for="item in actionable"
        :key="item.code"
        class="py-2 flex items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ item.symbol }}</span>
            <span
              class="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
              :class="
                item.status === 'buy'
                  ? 'bg-[var(--tape-up-soft)] text-[var(--tape-up)]'
                  : 'bg-[var(--tape-down-soft)] text-[var(--tape-down)]'
              "
            >
              {{ item.status }}
            </span>
          </div>
          <div class="text-[11px] text-soft text-mono mt-0.5">
            {{ formatPercent(item.current) }} → {{ formatPercent(item.target) }}
            <span class="ml-1 text-muted">
              ({{ item.drift > 0 ? '+' : '' }}{{ formatPercent(item.drift) }} drift)
            </span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-mono text-sm font-medium">
            {{ item.shares }} sh
          </div>
          <div class="text-[11px] text-soft text-mono">
            ≈ {{ fmtUsd(item.delta) }}
          </div>
        </div>
        <button
          class="size-8 rounded-md bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)] flex-center transition-colors text-soft hover:text-[var(--tape-text)]"
          :title="`${item.status === 'buy' ? 'Buy' : 'Sell'} ${item.shares} ${item.symbol}`"
          @click="$emit('trade', { code: item.code, symbol: item.symbol, mode: item.status === 'buy' ? 'buy' : 'sell', shares: item.shares })"
        >
          <IconArrowUpRight v-if="item.status === 'buy'" class="size-3.5" />
          <IconArrowDownRight v-else class="size-3.5" />
        </button>
      </li>
    </ul>
  </article>
</template>
