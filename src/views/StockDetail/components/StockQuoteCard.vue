<script setup lang="ts">
import type { Quote } from '@/types/stock'
import { direction, formatChange, formatCompact, formatPercent } from '@/utils/format'
import { pickActiveSession, SESSION_META } from '@/utils/session'
import Range52WBar from '@/components/ui/Range52WBar.vue'

const props = defineProps<{ quote: Quote }>()

const dir = computed(() => direction(props.quote.change))
const trendClass = computed(() => {
  if (dir.value === 'up') return 'text-[var(--tape-up)]'
  if (dir.value === 'down') return 'text-[var(--tape-down)]'
  return 'text-[var(--tape-text-soft)]'
})
const changeClass = computed(() => {
  if (dir.value === 'up') return 'pill-up'
  if (dir.value === 'down') return 'pill-down'
  return 'pill-flat'
})

const extendedSessions = computed(() => {
  const active = pickActiveSession(props.quote)
  if (active.kind === 'regular' || active.fallback) return null
  return active
})
</script>

<template>
  <article class="surface p-5 sm:p-6">
    <div>
      <div class="flex flex-col">
        <span class="text-[10px] uppercase tracking-wider text-soft">Intraday price</span>
        <div class="mt-1 flex items-end justify-between gap-2 flex-wrap">
          <span
            class="text-mono text-3xl sm:text-4xl font-semibold tracking-tight"
            :class="trendClass"
          >
            {{ quote.last.toFixed(2) }}
          </span>
          <span :class="changeClass" class="mb-1">
            {{ formatChange(quote.change) }} / 
            {{ formatPercent(quote.changePct) }}
          </span>
        </div>
      </div>
    </div>

    <Range52WBar
      v-if="quote.high52w && quote.low52w"
      :last="quote.last"
      :high="quote.high52w"
      :low="quote.low52w"
      :show-labels="true"
      class="mt-5"
    />

    <dl
      v-if="extendedSessions"
      class="mt-5 pt-4 border-t border-[var(--tape-border)] text-xs"
    >
      <div class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-bg-soft)] px-3 py-2.5">
        <dt class="flex items-center gap-1.5 text-soft text-[10px] uppercase tracking-wider">
          <component :is="SESSION_META[extendedSessions.kind].icon" class="size-3" />
          {{ SESSION_META[extendedSessions.kind].label }}
        </dt>
        <dd class="mt-1.5 flex items-baseline justify-between gap-2">
          <span class="text-mono text-sm text-[var(--tape-text)]">
            {{ extendedSessions.price.toFixed(2) }}
          </span>
          <span
            class="text-mono text-xs"
            :class="
              extendedSessions.change > 0
                ? 'text-[var(--tape-up)]'
                : extendedSessions.change < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatChange(extendedSessions.change) }}
            ({{ formatPercent(extendedSessions.changePct) }})
          </span>
        </dd>
      </div>
    </dl>

    <dl class="mt-5 pt-4 border-t border-[var(--tape-border)] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">Open</dt>
        <dd class="text-mono mt-0.5">{{ quote.open.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">High</dt>
        <dd class="text-mono mt-0.5">{{ quote.high.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">Low</dt>
        <dd class="text-mono mt-0.5">{{ quote.low.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">Prev Close</dt>
        <dd class="text-mono mt-0.5">{{ quote.prevClose.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">Volume</dt>
        <dd class="text-mono mt-0.5">{{ formatCompact(quote.volume) }}</dd>
      </div>
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">Turnover</dt>
        <dd class="text-mono mt-0.5">{{ formatCompact(quote.turnover) }}</dd>
      </div>
    </dl>
  </article>
</template>
