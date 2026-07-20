<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { GLOBAL_TICKER_CODES, useQuotesStore } from '@/stores/quotes'
import type { Quote } from '@/types/stock'
import { direction, formatNumber, formatPercent } from '@/utils/format'

interface TickerEntry {
  code: (typeof GLOBAL_TICKER_CODES)[number]
  label: string
}

const TICKERS: TickerEntry[] = [
  { code: 'US.SPY', label: 'SPY' },
  { code: 'US.QQQ', label: 'QQQ' },
  // { code: 'US..DJI', label: 'Dow Jones' },
  // { code: 'US..IXIC', label: 'Nasdaq' },
  // { code: 'US..SPX', label: 'S&P 500' },
  // { code: 'US..VIX', label: 'VIX' },
  { code: 'HK.800000', label: 'Hang Seng' },
  // { code: 'SH.000001', label: 'Shanghai Composite' },
  { code: 'US.EWJ', label: 'Japan EWJ' },
  { code: 'US.GLD', label: 'Gold GLD' },
  { code: 'US.USO', label: 'Oil USO' },
]

const store = useQuotesStore()
store.start()
const { quotes } = storeToRefs(store)

function get(code: string): Quote | undefined {
  return quotes.value.get(code)
}

function priceFor(code: string): string {
  const q = get(code)
  if (!q) return '--'
  const digits = q.last >= 1000 ? 0 : q.last >= 10 ? 2 : 3
  return formatNumber(q.last, digits)
}

function dirOf(code: string): 'up' | 'down' | 'flat' {
  const q = get(code)
  if (!q) return 'flat'
  return direction(q.change)
}

function pctFor(code: string): string {
  const q = get(code)
  if (!q) return '--'
  return formatPercent(q.changePct)
}

const trackItems = [...TICKERS, ...TICKERS]
</script>

<template>
  <div
    class="ticker-strip sticky top-14 z-30 border-b border-[var(--tape-border)] bg-[var(--tape-bg-elev)]/95 backdrop-blur overflow-hidden"
    aria-label="Global indices ticker"
    role="marquee"
  >
    <div class="ticker-track flex items-center gap-8 py-2 px-4">
      <span
        v-for="(t, i) in trackItems"
        :key="`${i}-${t.code}`"
        class="flex items-center gap-2 text-xs whitespace-nowrap"
      >
        <span class="text-soft uppercase tracking-wider text-[10px]">
          {{ t.label }}
        </span>
        <span class="text-mono font-medium">
          {{ priceFor(t.code) }}
        </span>
        <span
          class="text-mono"
          :class="{
            'text-[var(--tape-up)]': dirOf(t.code) === 'up',
            'text-[var(--tape-down)]': dirOf(t.code) === 'down',
            'text-[var(--tape-text-soft)]': dirOf(t.code) === 'flat',
          }"
        >
          {{ pctFor(t.code) }}
        </span>
        <span class="text-soft mx-2 opacity-50">·</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.ticker-track {
  width: max-content;
  animation: ticker-scroll 60s linear infinite;
  will-change: transform;
}
.ticker-strip:hover .ticker-track {
  animation-play-state: paused;
}
@keyframes ticker-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track {
    animation: none;
  }
  .ticker-strip {
    overflow-x: auto;
  }
}
</style>
