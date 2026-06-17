<script setup lang="ts">
import { computed } from 'vue'
import IconCalendarClock from '~icons/lucide/calendar-clock'
import { useEarningsStore } from '@/stores/earnings'

const props = defineProps<{ code: string; compact?: boolean }>()

const earnings = useEarningsStore()

const days = computed(() => earnings.daysUntil(props.code))
const visible = computed(() => {
  const d = days.value
  if (d === null) return false
  return !props.compact || d <= 14
})

const tone = computed(() => {
  const d = days.value
  if (d === null) return ''
  if (d <= 1) return 'border-[var(--tape-down)] text-[var(--tape-down)] bg-[var(--tape-down-soft)]'
  if (d <= 7) return 'border-[var(--tape-warn)] text-[var(--tape-warn)] bg-[rgba(217,119,6,0.08)]'
  return 'border-[var(--tape-border)] text-soft'
})

const text = computed(() => {
  const d = days.value
  if (d === null) return ''
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return `In ${d}d`
})
</script>

<template>
  <span
    v-if="visible"
    class="inline-flex items-center gap-1 rounded-full border px-1.5 h-5 text-[10px] font-medium tracking-wide"
    :class="tone"
    :title="`Next earnings: ${earnings.get(code)?.nextDate}`"
  >
    <IconCalendarClock class="size-3" />
    <span v-if="!compact">ER</span>
    <span class="text-mono">{{ text }}</span>
  </span>
</template>
