<script setup lang="ts">
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type { KlineBar } from '@/types/kline'
import KlineChart, { type KlineOverlay, type KlineTradeMarker } from '@/components/kline/KlineChart.vue'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'
import type { StockIndicators } from '../types'

defineProps<{
  bars: KlineBar[]
  intraday: boolean
  indicators: StockIndicators
  loading: boolean
  error: string | null
  /** Extra overlays resolved from the indicator catalog. Pass-through only. */
  overlays?: KlineOverlay[]
  /** Personal ledger markers for buy/sell/dividend events. */
  tradeMarkers?: KlineTradeMarker[]
}>()

defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <article class="surface p-3 sm:p-4">
    <div class="relative w-full" style="height: 520px">
      <KlineChart
        v-if="bars.length"
        :bars="bars"
        :intraday="intraday"
        :indicators="indicators"
        :overlays="overlays"
        :trade-markers="tradeMarkers"
      />
      <ChartSkeleton
        v-if="loading"
        label="Loading price chart"
        :class="bars.length ? 'opacity-40' : undefined"
      />
      <div v-else-if="error" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
        <IconTriangleAlert class="size-5 text-[var(--tape-down)]" />
        <p class="text-sm text-[var(--tape-down)] max-w-md">{{ error }}</p>
        <button class="btn-outline h-8 px-3 text-xs mt-1" @click="$emit('retry')">Retry</button>
      </div>
      <div v-else-if="!bars.length" class="absolute inset-0 flex-center text-sm text-soft">
        No K-line data
      </div>
    </div>
  </article>
</template>
