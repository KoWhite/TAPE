<script setup lang="ts">
import IconActivity from '~icons/lucide/activity'
import IconBadgeDollarSign from '~icons/lucide/badge-dollar-sign'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconWallet from '~icons/lucide/wallet'
import { formatChange, formatPercent } from '@/utils/format'
import type { PortfolioSummary } from '../types'

defineProps<{
  summary: PortfolioSummary
  positionsCount: number
}>()
</script>

<template>
  <div class="grid grid-cols-1 xs:grid-cols-2 xl:grid-cols-6 gap-2.5 sm:gap-3">
    <article class="surface p-4 xl:col-span-1">
      <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
        <IconWallet class="size-3" /> Market Value
      </div>
      <div class="text-mono text-xl sm:text-2xl font-semibold mt-1 break-all">
        {{ summary.value.toFixed(2) }}
      </div>
      <div v-if="summary.pricedCount < positionsCount" class="text-[10px] text-soft mt-0.5">
        {{ summary.pricedCount }}/{{ positionsCount }} priced
      </div>
    </article>
    <article class="surface p-4">
      <div class="text-[10px] uppercase tracking-wider text-soft">Cost Basis</div>
      <div class="text-mono text-xl sm:text-2xl font-semibold mt-1 text-soft break-all">
        {{ summary.cost.toFixed(2) }}
      </div>
    </article>
    <article class="surface p-4">
      <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
        <IconActivity class="size-3" /> Today
      </div>
      <div
        class="text-mono text-xl sm:text-2xl font-semibold mt-1 break-all"
        :class="summary.dayChange > 0 ? 'text-[var(--tape-up)]' : summary.dayChange < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
      >
        {{ formatChange(summary.dayChange) }}
      </div>
      <div
        class="text-[11px] text-mono tabular-nums mt-0.5"
        :class="summary.dayChangePct > 0 ? 'text-[var(--tape-up)]' : summary.dayChangePct < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
      >
        {{ formatPercent(summary.dayChangePct) }}
      </div>
    </article>
    <article class="surface p-4">
      <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
        <component :is="summary.unrealizedPnl >= 0 ? IconTrendingUp : IconTrendingDown" class="size-3" />
        Unrealized
      </div>
      <div
        class="text-mono text-xl sm:text-2xl font-semibold mt-1 break-all"
        :class="summary.unrealizedPnl > 0 ? 'text-[var(--tape-up)]' : summary.unrealizedPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
      >
        {{ formatChange(summary.unrealizedPnl) }}
      </div>
    </article>
    <article class="surface p-4">
      <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
        <IconBadgeDollarSign class="size-3" /> Realized
      </div>
      <div
        class="text-mono text-xl sm:text-2xl font-semibold mt-1 break-all"
        :class="summary.realizedPnl > 0 ? 'text-[var(--tape-up)]' : summary.realizedPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
      >
        {{ formatChange(summary.realizedPnl) }}
      </div>
    </article>
    <article class="surface p-4">
      <div class="text-[10px] uppercase tracking-wider text-soft">Total Return</div>
      <div
        class="text-mono text-xl sm:text-2xl font-semibold mt-1 break-all"
        :class="summary.totalPnl > 0 ? 'text-[var(--tape-up)]' : summary.totalPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
      >
        {{ formatPercent(summary.totalReturnPct) }}
      </div>
      <div
        class="text-[11px] text-mono tabular-nums mt-0.5"
        :class="summary.totalPnl > 0 ? 'text-[var(--tape-up)]' : summary.totalPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
      >
        {{ formatChange(summary.totalPnl) }}
      </div>
    </article>
  </div>
</template>
