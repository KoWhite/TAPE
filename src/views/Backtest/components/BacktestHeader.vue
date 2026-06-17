<script setup lang="ts">
defineProps<{ isRunning: boolean }>()

const emit = defineEmits<{ rerun: [] }>()
</script>

<template>
  <div class="flex-between flex-wrap gap-3">
    <div>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
        <IconLucideLineChart class="size-5 text-[var(--tape-accent)]" />
        Backtest
      </h2>
      <p class="text-xs text-muted mt-1">
        Stage B - template strategies - pandas engine - yfinance OHLCV
      </p>
    </div>
    <button
      class="btn-ghost h-8 px-3 text-xs"
      :disabled="isRunning"
      @click="emit('rerun')"
    >
      <IconLucideRefreshCw class="size-3.5" :class="isRunning && 'animate-spin'" />
      Re-run
    </button>
  </div>
</template>
