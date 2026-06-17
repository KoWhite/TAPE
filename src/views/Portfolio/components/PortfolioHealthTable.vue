<script setup lang="ts">
import { computed } from 'vue'
import { formatPercent, formatPrice } from '@/utils/format'
import type { PortfolioRow } from '../types'

const props = defineProps<{
  rows: PortfolioRow[]
}>()

const emit = defineEmits<{ open: [code: string] }>()

/** Value-descending so the heaviest holdings sit at the top of the check. */
const sorted = computed(() => [...props.rows].sort((a, b) => b.value - a.value))

/** Decimal distance from current price to a target; null when no plan set or
 *  no live quote. Positive = price still has that much room to reach a take-
 *  profit above; for stop-loss we report how far price sits above the stop. */
function toTakeProfit(row: PortfolioRow): number | null {
  if (!row.hasQuote || !row.takeProfitPrice || row.last <= 0) return null
  return (row.takeProfitPrice - row.last) / row.last
}
function toStopLoss(row: PortfolioRow): number | null {
  if (!row.hasQuote || !row.stopLossPrice || row.last <= 0) return null
  return (row.last - row.stopLossPrice) / row.last
}

function pnlClass(v: number): string {
  return v > 0 ? 'text-[var(--tape-up)]' : v < 0 ? 'text-[var(--tape-down)]' : 'text-soft'
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-[var(--tape-border)]">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
          <th class="text-left font-medium px-3 py-2">Holding</th>
          <th class="text-right font-medium px-3 py-2">Weight</th>
          <th class="text-right font-medium px-3 py-2">Avg Cost</th>
          <th class="text-right font-medium px-3 py-2">Last</th>
          <th class="text-right font-medium px-3 py-2">Unreal.</th>
          <th class="text-right font-medium px-3 py-2">→ TP</th>
          <th class="text-right font-medium px-3 py-2">→ SL</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in sorted"
          :key="row.code"
          class="border-b border-[var(--tape-border)] last:border-b-0 hover:bg-[var(--tape-button-bg)] cursor-pointer"
          @click="emit('open', row.code)"
        >
          <td class="px-3 py-2">
            <div class="font-medium">{{ row.symbol }}</div>
            <div class="text-[10px] text-soft">{{ row.code }}</div>
          </td>
          <td class="px-3 py-2 text-right text-mono">{{ (row.weight * 100).toFixed(1) }}%</td>
          <td class="px-3 py-2 text-right text-mono text-soft">{{ formatPrice(row.avgCost) }}</td>
          <td class="px-3 py-2 text-right text-mono">
            {{ row.hasQuote ? formatPrice(row.last) : '—' }}
          </td>
          <td class="px-3 py-2 text-right text-mono" :class="pnlClass(row.unrealizedPnl)">
            {{ row.hasQuote ? formatPercent(row.pnlPct) : '—' }}
          </td>
          <td
            class="px-3 py-2 text-right text-mono"
            :class="toTakeProfit(row) === null ? 'text-soft' : 'text-[var(--tape-up)]'"
          >
            {{ toTakeProfit(row) === null ? '—' : formatPercent(toTakeProfit(row)!) }}
          </td>
          <td
            class="px-3 py-2 text-right text-mono"
            :class="toStopLoss(row) === null ? 'text-soft' : 'text-[var(--tape-down)]'"
          >
            {{ toStopLoss(row) === null ? '—' : formatPercent(toStopLoss(row)!) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
