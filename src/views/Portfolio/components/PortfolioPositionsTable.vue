<script setup lang="ts">
import IconBadgeDollarSign from '~icons/lucide/badge-dollar-sign'
import IconCrosshair from '~icons/lucide/crosshair'
import IconMinus from '~icons/lucide/minus'
import IconPlus from '~icons/lucide/plus'
import { formatChange, formatPercent } from '@/utils/format'
import type { PortfolioRow } from '../types'

defineProps<{ rows: PortfolioRow[] }>()

defineEmits<{
  (e: 'open', code: string): void
  (e: 'buy', code: string): void
  (e: 'sell', code: string): void
  (e: 'close', code: string): void
  (e: 'plan', code: string): void
}>()
</script>

<template>
  <article class="surface overflow-hidden">
    <div class="sm:hidden divide-y divide-[var(--tape-border)]">
      <div v-if="!rows.length" class="px-4 py-10 text-center text-sm text-soft">
        No open positions yet. Add a buy transaction to start tracking P&amp;L.
      </div>
      <article
        v-for="r in rows"
        :key="r.code"
        class="p-4 space-y-3 active:bg-[var(--tape-surface-hover-bg)]"
        @click="$emit('open', r.code)"
      >
        <header class="flex-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold tracking-tight truncate">{{ r.symbol }}</span>
              <EarningsBadge :code="r.code" compact />
            </div>
            <div class="text-[10px] text-soft tracking-wider uppercase truncate">
              {{ r.code }}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-mono text-sm font-semibold">
              <span v-if="r.hasQuote">{{ r.last.toFixed(2) }}</span>
              <span v-else class="text-soft">--</span>
            </div>
            <div class="text-[10px] text-soft">last</div>
          </div>
        </header>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div class="text-soft uppercase tracking-wider text-[10px]">Value</div>
            <div class="text-mono font-semibold mt-0.5">{{ r.value.toFixed(2) }}</div>
          </div>
          <div>
            <div class="text-soft uppercase tracking-wider text-[10px]">Weight</div>
            <div class="text-mono font-semibold mt-0.5">{{ (r.weight * 100).toFixed(1) }}%</div>
          </div>
          <div>
            <div class="text-soft uppercase tracking-wider text-[10px]">Today</div>
            <div
              class="text-mono font-semibold mt-0.5"
              :class="r.dayChange > 0 ? 'text-[var(--tape-up)]' : r.dayChange < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
            >
              {{ r.hasQuote ? formatChange(r.dayChange) : '--' }}
              <span v-if="r.hasQuote" class="text-[10px] opacity-80">
                {{ formatPercent(r.dayChangePct) }}
              </span>
            </div>
          </div>
          <div>
            <div class="text-soft uppercase tracking-wider text-[10px]">Unrealized</div>
            <div
              class="text-mono font-semibold mt-0.5"
              :class="r.unrealizedPnl > 0 ? 'text-[var(--tape-up)]' : r.unrealizedPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
            >
              {{ formatChange(r.unrealizedPnl) }}
            </div>
          </div>
        </div>

        <div
          v-if="r.takeProfitPrice || r.stopLossPrice || r.targetWeight"
          class="flex flex-wrap gap-1.5 text-[10px] text-muted"
        >
          <span v-if="r.takeProfitPrice" class="pill-flat">TP {{ r.takeProfitPrice.toFixed(2) }}</span>
          <span v-if="r.stopLossPrice" class="pill-flat">SL {{ r.stopLossPrice.toFixed(2) }}</span>
          <span v-if="r.targetWeight" class="pill-flat">Target {{ (r.targetWeight * 100).toFixed(1) }}%</span>
        </div>

        <div class="grid grid-cols-4 gap-2 pt-1" @click.stop>
          <button
            class="h-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
            title="Buy / add"
            @click="$emit('buy', r.code)"
          >
            <IconPlus class="size-4" />
          </button>
          <button
            class="h-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
            title="Sell / reduce"
            @click="$emit('sell', r.code)"
          >
            <IconMinus class="size-4" />
          </button>
          <button
            class="h-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
            title="Exit plan"
            @click="$emit('plan', r.code)"
          >
            <IconCrosshair class="size-4" />
          </button>
          <button
            class="h-10 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)]"
            title="Close position"
            @click="$emit('close', r.code)"
          >
            <IconBadgeDollarSign class="size-4" />
          </button>
        </div>
      </article>
    </div>

    <div class="hidden sm:block overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
          <th class="text-left font-medium px-4 py-2">Symbol</th>
          <th class="text-right font-medium px-3 py-2">Shares</th>
          <th class="text-right font-medium px-3 py-2">Avg Cost</th>
          <th class="text-right font-medium px-3 py-2">Last</th>
          <th class="text-right font-medium px-3 py-2">Today</th>
          <th class="text-right font-medium px-3 py-2">Value</th>
          <th class="text-right font-medium px-3 py-2">Unrealized</th>
          <th class="text-right font-medium px-3 py-2">Realized</th>
          <th class="text-left font-medium px-3 py-2">Plan</th>
          <th class="text-right font-medium px-3 py-2">Weight</th>
          <th class="text-right font-medium px-3 py-2 w-36"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td colspan="11" class="px-4 py-12 text-center text-sm text-soft">
            No open positions yet - add a buy transaction to start tracking P&amp;L.
          </td>
        </tr>
        <tr
          v-for="r in rows"
          :key="r.code"
          class="border-b border-[var(--tape-border)] last:border-b-0 hover:bg-[var(--tape-surface-hover-bg)] cursor-pointer transition-colors"
          @click="$emit('open', r.code)"
        >
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <span class="font-semibold tracking-tight">{{ r.symbol }}</span>
              <EarningsBadge :code="r.code" compact />
            </div>
            <div class="text-[10px] text-soft tracking-wider uppercase">
              {{ r.code }}
            </div>
          </td>
          <td class="text-mono text-right px-3 py-3">{{ r.shares }}</td>
          <td class="text-mono text-right px-3 py-3 text-soft">
            {{ r.avgCost.toFixed(2) }}
          </td>
          <td class="text-mono text-right px-3 py-3">
            <span v-if="r.hasQuote">{{ r.last.toFixed(2) }}</span>
            <span v-else class="text-soft">--</span>
          </td>
          <td
            class="text-mono text-right px-3 py-3"
            :class="
              r.dayChange > 0
                ? 'text-[var(--tape-up)]'
                : r.dayChange < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            <div v-if="r.hasQuote">
              {{ formatChange(r.dayChange) }}
              <div class="text-[10px] tabular-nums opacity-80">
                {{ formatPercent(r.dayChangePct) }}
              </div>
            </div>
            <span v-else class="text-soft">--</span>
          </td>
          <td class="text-mono text-right px-3 py-3">
            {{ r.value.toFixed(2) }}
          </td>
          <td
            class="text-mono text-right px-3 py-3"
            :class="r.unrealizedPnl > 0 ? 'text-[var(--tape-up)]' : r.unrealizedPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
          >
            {{ formatChange(r.unrealizedPnl) }}
            <div class="text-[10px] tabular-nums opacity-80">
              {{ formatPercent(r.pnlPct) }}
            </div>
          </td>
          <td
            class="text-mono text-right px-3 py-3"
            :class="r.realizedPnl > 0 ? 'text-[var(--tape-up)]' : r.realizedPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
          >
            {{ formatChange(r.realizedPnl) }}
          </td>
          <td class="px-3 py-3 text-xs text-muted">
            <div v-if="r.takeProfitPrice || r.stopLossPrice || r.targetWeight" class="space-y-0.5">
              <div v-if="r.takeProfitPrice">TP {{ r.takeProfitPrice.toFixed(2) }}</div>
              <div v-if="r.stopLossPrice">SL {{ r.stopLossPrice.toFixed(2) }}</div>
              <div v-if="r.targetWeight">Target {{ (r.targetWeight * 100).toFixed(1) }}%</div>
            </div>
            <span v-else class="text-soft">--</span>
          </td>
          <td class="text-mono text-right px-3 py-3 text-soft">
            {{ (r.weight * 100).toFixed(1) }}%
          </td>
          <td class="text-right px-3 py-3" @click.stop>
            <div class="flex items-center justify-end gap-1">
              <button
                class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
                title="Buy / add"
                @click="$emit('buy', r.code)"
              >
                <IconPlus class="size-3.5" />
              </button>
              <button
                class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
                title="Sell / reduce"
                @click="$emit('sell', r.code)"
              >
                <IconMinus class="size-3.5" />
              </button>
              <button
                class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]"
                title="Exit plan"
                @click="$emit('plan', r.code)"
              >
                <IconCrosshair class="size-3.5" />
              </button>
              <button
                class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)]"
                title="Close position"
                @click="$emit('close', r.code)"
              >
                <IconBadgeDollarSign class="size-3.5" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    </div>
  </article>
</template>
