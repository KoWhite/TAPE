<script setup lang="ts">
import IconArchive from '~icons/lucide/archive'
import { formatChange } from '@/utils/format'
import type { ClosedPortfolioPosition } from '@/stores/portfolio'

defineProps<{ positions: ClosedPortfolioPosition[] }>()
</script>

<template>
  <article v-if="positions.length" class="surface overflow-hidden">
    <header class="px-4 py-3 border-b border-[var(--tape-border)] flex items-center gap-2">
      <IconArchive class="size-4 text-[var(--tape-accent)]" />
      <h3 class="font-semibold tracking-tight">Closed positions</h3>
      <span class="text-[10px] text-soft uppercase tracking-wider">
        {{ positions.length }}
      </span>
    </header>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
            <th class="text-left font-medium px-4 py-2">Symbol</th>
            <th class="text-left font-medium px-3 py-2">Opened</th>
            <th class="text-left font-medium px-3 py-2">Closed</th>
            <th class="text-right font-medium px-3 py-2">Shares</th>
            <th class="text-right font-medium px-3 py-2">Realized</th>
            <th class="text-left font-medium px-3 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in positions"
            :key="p.id"
            class="border-b border-[var(--tape-border)] last:border-b-0"
          >
            <td class="px-4 py-3">
              <div class="font-medium">{{ p.symbol }}</div>
              <div class="text-[10px] text-soft">{{ p.code }}</div>
            </td>
            <td class="px-3 py-3 text-mono text-xs text-soft">{{ p.openedAt }}</td>
            <td class="px-3 py-3 text-mono text-xs text-soft">{{ p.closedAt }}</td>
            <td class="px-3 py-3 text-right text-mono">{{ p.shares }}</td>
            <td
              class="px-3 py-3 text-right text-mono"
              :class="p.realizedPnl > 0 ? 'text-[var(--tape-up)]' : p.realizedPnl < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
            >
              {{ formatChange(p.realizedPnl) }}
            </td>
            <td class="px-3 py-3 text-xs text-muted">{{ p.reason || '--' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
</template>
