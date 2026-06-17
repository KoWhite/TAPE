<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    last: number
    high: number
    low: number
    /** Show the numeric endpoints as labels under the bar. */
    showLabels?: boolean
    /** "52W" by default -pass "ATH" for an all-time-range variant. */
    label?: string
  }>(),
  { showLabels: false, label: '52W' },
)

const valid = computed(
  () =>
    Number.isFinite(props.high) &&
    Number.isFinite(props.low) &&
    Number.isFinite(props.last) &&
    props.high > props.low,
)

const pct = computed(() => {
  if (!valid.value) return 0
  const raw = (props.last - props.low) / (props.high - props.low)
  return Math.max(0, Math.min(1, raw)) * 100
})

const tone = computed<'up' | 'down' | 'neutral'>(() => {
  if (!valid.value) return 'neutral'
  if (pct.value >= 80) return 'up'
  if (pct.value <= 20) return 'down'
  return 'neutral'
})

const fillColor = computed(() => {
  if (tone.value === 'up') return 'var(--tape-up)'
  if (tone.value === 'down') return 'var(--tape-down)'
  return 'var(--tape-text-soft)'
})
</script>

<template>
  <div v-if="valid" class="w-full">
    <div class="flex items-center justify-between text-[10px] text-soft tracking-wider uppercase mb-1">
      <span>{{ label }} Range</span>
      <span class="text-mono normal-case tracking-normal">
        {{ pct.toFixed(0) }}%
      </span>
    </div>
    <div
      class="relative h-1.5 rounded-full bg-[var(--tape-surface-hover-bg)] overflow-visible"
    >
      <div
        class="absolute left-0 top-0 bottom-0 rounded-full opacity-60"
        :style="{ width: `${pct}%`, background: fillColor }"
      />
      <div
        class="absolute top-1/2 size-2.5 rounded-full border-2 border-[var(--tape-bg-elev)]"
        :style="{
          left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          background: fillColor,
        }"
      />
    </div>
    <div
      v-if="showLabels"
      class="flex items-center justify-between text-[10px] text-mono text-soft mt-1"
    >
      <span>{{ low.toFixed(2) }}</span>
      <span>{{ high.toFixed(2) }}</span>
    </div>
  </div>
</template>
