<script setup lang="ts">
import type { IndicatorMeta } from '@/types/indicator'
import type { StockIndicators, StockPeriod } from '../types'

defineProps<{
  periods: StockPeriod[]
  period: StockPeriod
  indicators: StockIndicators
  /** Backend-catalog overlays the user can toggle. Filter to pane=overlay
   *  upstream — this component renders whatever it's given. */
  overlayCatalog: IndicatorMeta[]
  /** Set of indicator ids that are currently turned on. */
  activeOverlays: Set<string>
}>()

defineEmits<{
  (e: 'update:period', value: StockPeriod): void
  (e: 'toggle-indicator', value: keyof StockIndicators): void
  (e: 'toggle-overlay', id: string): void
}>()
</script>

<template>
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="flex items-center gap-1 flex-wrap">
      <button
        v-for="p in periods"
        :key="p.id"
        class="px-3 h-8 rounded-lg text-xs font-medium tracking-wide transition-colors"
        :class="
          period.id === p.id
            ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
            : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
        "
        @click="$emit('update:period', p)"
      >
        {{ p.label }}
      </button>
    </div>
    <div class="flex items-center gap-1 flex-wrap">
      <button
        v-for="ind in (['boll', 'rsi', 'macd'] as const)"
        :key="ind"
        class="px-2.5 h-7 rounded-lg text-[11px] font-semibold tracking-wide uppercase transition-colors"
        :class="
          indicators[ind]
            ? 'bg-[var(--tape-accent)] text-[var(--tape-bg)]'
            : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
        "
        @click="$emit('toggle-indicator', ind)"
      >
        {{ ind }}
      </button>
      <span
        v-if="overlayCatalog.length"
        class="mx-1 inline-block w-px h-4 bg-[var(--tape-border)]"
        aria-hidden="true"
      />
      <button
        v-for="meta in overlayCatalog"
        :key="meta.id"
        class="px-2.5 h-7 rounded-lg text-[11px] font-semibold tracking-wide uppercase transition-colors"
        :class="
          activeOverlays.has(meta.id)
            ? 'bg-[var(--tape-info)] text-[var(--tape-bg)]'
            : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
        "
        :title="meta.description"
        @click="$emit('toggle-overlay', meta.id)"
      >
        {{ meta.id }}
      </button>
    </div>
  </div>
</template>
