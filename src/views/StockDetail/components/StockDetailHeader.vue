<script setup lang="ts">
import IconArrowLeft from '~icons/lucide/arrow-left'
import IconBell from '~icons/lucide/bell'
import IconLineChart from '~icons/lucide/line-chart'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import type { Quote } from '@/types/stock'

defineProps<{
  quote: Quote | null
  code: string
  alertsCount: number
  loading: boolean
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'alert'): void
  (e: 'backtest'): void
  (e: 'refresh'): void
}>()
</script>

<template>
  <div>
    <div class="h-11" aria-hidden="true" />
    <div
      class="fixed top-13 sm:top-[3.25rem] left-0 lg:left-[224px] xl:left-[236px] right-0 z-30 h-11 px-2.5 sm:px-6 lg:px-8 bg-[var(--tape-glass)] backdrop-blur-xl border-b border-[var(--tape-border)] flex items-center gap-1.5 sm:gap-2"
    >
      <button
        class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors shrink-0"
        title="Back"
        aria-label="Back"
        @click="$emit('back')"
      >
        <IconArrowLeft class="size-4" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-1.5 sm:gap-2 min-w-0">
          <h2 class="text-base sm:text-lg font-semibold tracking-tight truncate">
            {{ quote?.symbol || code }}
          </h2>
          <span class="text-[10px] uppercase tracking-wider text-soft truncate">
            {{ code }}
          </span>
        </div>
        <p v-if="quote?.name" class="hidden md:block text-[10px] text-muted truncate leading-3">
          {{ quote.name }}
        </p>
      </div>
      <button
        class="btn-ghost !w-8 !h-8 !p-0 !gap-0 sm:!w-auto sm:!h-8 sm:!px-3 sm:!gap-2 text-xs shrink-0"
        title="Backtest this symbol"
        @click="$emit('backtest')"
      >
        <IconLineChart class="!text-[16px] sm:!text-[14px]" />
        <span class="hidden sm:inline">Backtest</span>
      </button>
      <button
        class="btn-ghost !w-8 !h-8 !p-0 !gap-0 sm:!w-auto sm:!h-8 sm:!px-3 sm:!gap-2 text-xs relative shrink-0"
        title="Manage alerts"
        @click="$emit('alert')"
      >
        <IconBell class="!text-[16px] sm:!text-[14px]" />
        <span class="hidden sm:inline">Alert</span>
        <span
          v-if="alertsCount"
          class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--tape-accent)] text-[10px] font-semibold text-[var(--tape-bg)] flex-center"
        >
          {{ alertsCount }}
        </span>
      </button>
      <button
        class="btn-ghost !w-8 !h-8 !p-0 !gap-0 sm:!w-auto sm:!h-8 sm:!px-3 sm:!gap-2 text-xs shrink-0"
        :disabled="loading"
        title="Refresh"
        @click="$emit('refresh')"
      >
        <IconRefreshCw class="!text-[16px] sm:!text-[14px]" :class="loading && 'animate-spin'" />
        <span class="hidden sm:inline">Refresh</span>
      </button>
    </div>
  </div>
</template>
