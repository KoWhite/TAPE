<script setup lang="ts">
import IconHistory from '~icons/lucide/history'
import IconTrash2 from '~icons/lucide/trash-2'
import { formatChange } from '@/utils/format'
import type { PortfolioTransactionRow } from '../types'

defineProps<{
  transactions: PortfolioTransactionRow[]
  pendingRemoveId?: string | null
}>()

defineEmits<{
  (e: 'requestRemove', id: string): void
  (e: 'confirmRemove', id: string): void
  (e: 'cancelRemove'): void
}>()

function cashImpact(tx: PortfolioTransactionRow): number {
  if (tx.type === 'buy') return -(tx.shares * tx.price + tx.fee)
  if (tx.type === 'sell') return tx.shares * tx.price - tx.fee
  if (tx.type === 'dividend' || tx.type === 'interest' || tx.type === 'deposit') return tx.amount ?? 0
  if (tx.type === 'fee' || tx.type === 'withdrawal') return -(tx.amount ?? tx.fee)
  return 0
}
</script>

<template>
  <article class="surface overflow-hidden">
    <header class="px-4 py-3 border-b border-[var(--tape-border)] flex items-center gap-2">
      <IconHistory class="size-4 text-[var(--tape-accent)]" />
      <h3 class="font-semibold tracking-tight">Transactions</h3>
      <span class="text-[10px] text-soft uppercase tracking-wider">
        {{ transactions.length }}
      </span>
    </header>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
            <th class="text-left font-medium px-4 py-2">Date</th>
            <th class="text-left font-medium px-3 py-2">Type</th>
            <th class="text-left font-medium px-3 py-2">Symbol</th>
            <th class="text-right font-medium px-3 py-2">Shares</th>
            <th class="text-right font-medium px-3 py-2">Price</th>
            <th class="text-right font-medium px-3 py-2">Cash</th>
            <th class="text-left font-medium px-3 py-2">Reason</th>
            <th class="text-right font-medium px-3 py-2 w-28"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!transactions.length">
            <td colspan="8" class="px-4 py-8 text-center text-sm text-soft">
              No transaction records yet.
            </td>
          </tr>
          <tr
            v-for="tx in transactions"
            :key="tx.id"
            class="border-b border-[var(--tape-border)] last:border-b-0"
          >
            <td class="px-4 py-3 text-mono text-xs text-soft">{{ tx.date }}</td>
            <td class="px-3 py-3 capitalize">{{ tx.type }}</td>
            <td class="px-3 py-3">
              <div class="font-medium">{{ tx.symbol }}</div>
              <div class="text-[10px] text-soft">{{ tx.code }}</div>
            </td>
            <td class="px-3 py-3 text-right text-mono">{{ tx.shares }}</td>
            <td class="px-3 py-3 text-right text-mono">{{ tx.price.toFixed(2) }}</td>
            <td
              class="px-3 py-3 text-right text-mono"
              :class="cashImpact(tx) > 0 ? 'text-[var(--tape-up)]' : cashImpact(tx) < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
            >
              {{ formatChange(cashImpact(tx)) }}
            </td>
            <td class="px-3 py-3 text-xs text-muted">
              {{ tx.reason || tx.note || '--' }}
            </td>
            <td class="px-3 py-3 text-right">
              <div v-if="pendingRemoveId === tx.id" class="inline-flex items-center gap-1">
                <button
                  class="h-7 px-2 rounded-lg bg-[var(--tape-down-soft)] text-[var(--tape-down)] text-xs"
                  title="Confirm removal and rebuild portfolio"
                  @click="$emit('confirmRemove', tx.id)"
                >
                  Remove
                </button>
                <button
                  class="h-7 px-2 rounded-lg bg-[var(--tape-button-bg)] text-soft text-xs hover:text-[var(--tape-text)]"
                  title="Cancel removal"
                  @click="$emit('cancelRemove')"
                >
                  Cancel
                </button>
              </div>
              <button
                v-else
                class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)]"
                title="Remove transaction"
                @click="$emit('requestRemove', tx.id)"
              >
                <IconTrash2 class="size-3.5" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
