<script setup lang="ts">
import { computed } from 'vue'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconArrowDown from '~icons/lucide/arrow-down'
import IconHourglass from '~icons/lucide/hourglass'
import type { BacktestTrade } from '@/types/backtest'
import { formatChange, formatPercent } from '@/utils/format'

/**
 * Per-trade audit table. Sorted newest-first by entry time so the most
 * recent activity is at the top -easier to spot regime changes.
 *
 * Open positions (exitTime = null) get a distinct hourglass marker and
 * are pinned to the top regardless of sort.
 */

interface Props {
  trades: BacktestTrade[]
  /** Optional cap to avoid rendering thousands of rows. */
  limit?: number
}

const props = withDefaults(defineProps<Props>(), { limit: 200 })

const sorted = computed(() => {
  const open = props.trades.filter((t) => t.exitTime === null)
  const closed = props.trades.filter((t) => t.exitTime !== null)
  // Closed trades: newest first by entryTime (handles both ISO strings
  // and epoch numbers -they sort consistently within their own type).
  closed.sort((a, b) => {
    const ax = String(a.entryTime)
    const bx = String(b.entryTime)
    return ax < bx ? 1 : ax > bx ? -1 : 0
  })
  return [...open, ...closed].slice(0, props.limit)
})

function formatTime(t: string | number | null): string {
  if (t === null) return '--'
  if (typeof t === 'number') {
    try {
      return new Date(t * 1000).toISOString().slice(0, 10)
    } catch {
      return String(t)
    }
  }
  return t
}

function pnlTone(pnl: number): string {
  if (pnl > 0) return 'text-[var(--tape-up)]'
  if (pnl < 0) return 'text-[var(--tape-down)]'
  return 'text-soft'
}
</script>

<template>
  <div v-if="!sorted.length" class="text-center py-8 text-sm text-soft">
    No trades -strategy never opened a position in this window.
  </div>
  <div v-else class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
          <th class="text-left font-medium px-3 py-2 w-8"></th>
          <th class="text-left font-medium px-3 py-2">Symbol</th>
          <th class="text-left font-medium px-3 py-2">Entry</th>
          <th class="text-left font-medium px-3 py-2">Exit</th>
          <th class="text-right font-medium px-3 py-2">Entry Px</th>
          <th class="text-right font-medium px-3 py-2">Exit Px</th>
          <th class="text-right font-medium px-3 py-2">Size</th>
          <th class="text-right font-medium px-3 py-2">P&L</th>
          <th class="text-right font-medium px-3 py-2">%</th>
          <th class="text-left font-medium px-3 py-2">Reason</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(t, i) in sorted"
          :key="`${t.symbol}-${t.entryTime}-${i}`"
          class="border-b border-[var(--tape-border)] last:border-b-0 hover:bg-[var(--tape-surface-hover-bg)] transition-colors"
        >
          <td class="px-3 py-2">
            <component
              :is="t.exitTime === null ? IconHourglass : t.side === 'long' ? IconArrowUp : IconArrowDown"
              class="size-3.5"
              :class="
                t.exitTime === null
                  ? 'text-[var(--tape-accent)]'
                  : t.side === 'long'
                  ? 'text-[var(--tape-up)]'
                  : 'text-[var(--tape-down)]'
              "
            />
          </td>
          <td class="px-3 py-2 font-semibold">{{ t.symbol }}</td>
          <td class="px-3 py-2 text-mono text-soft">{{ formatTime(t.entryTime) }}</td>
          <td class="px-3 py-2 text-mono text-soft">
            {{ t.exitTime === null ? 'open' : formatTime(t.exitTime) }}
          </td>
          <td class="px-3 py-2 text-mono tabular-nums text-right">
            {{ t.entryPrice.toFixed(2) }}
          </td>
          <td class="px-3 py-2 text-mono tabular-nums text-right">
            {{ t.exitPrice != null ? t.exitPrice.toFixed(2) : '--' }}
          </td>
          <td class="px-3 py-2 text-mono tabular-nums text-right text-soft">
            {{ t.size.toFixed(t.size < 1 ? 4 : 2) }}
          </td>
          <td class="px-3 py-2 text-mono tabular-nums text-right" :class="pnlTone(t.pnl)">
            {{ formatChange(t.pnl) }}
          </td>
          <td class="px-3 py-2 text-mono tabular-nums text-right" :class="pnlTone(t.pnlPct)">
            {{ formatPercent(t.pnlPct) }}
          </td>
          <td class="px-3 py-2 text-soft truncate max-w-xs" :title="t.reason ?? ''">
            {{ t.reason || '--' }}
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-if="trades.length > sorted.length"
      class="text-[10px] text-soft mt-2 text-center"
    >
      Showing latest {{ sorted.length }} of {{ trades.length }} trades.
    </p>
  </div>
</template>
