<script setup lang="ts">
import type { EarningsRecord } from '@/types/earnings'
import EarningsBadge from '@/components/ui/EarningsBadge.vue'
import { formatRevenueCompact } from '@/utils/format'

const props = defineProps<{
  code: string
  record: EarningsRecord
}>()

const upcomingDays = computed(() => {
  if (!props.record.nextDate) return null
  const target = new Date(`${props.record.nextDate}T00:00:00`).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 86_400_000)
})

const shouldShow = computed(() => {
  const days = upcomingDays.value
  if (days !== null && days >= 0 && days <= 14) return true
  return false
})
</script>

<template>
  <article
    v-if="shouldShow"
    class="surface p-4 sm:p-5"
  >
    <div class="flex items-center justify-between gap-3 flex-wrap mb-3">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold tracking-tight">Earnings</h3>
        <EarningsBadge :code="code" />
      </div>
      <div v-if="record.nextDate" class="text-right">
        <div class="text-[10px] text-soft tracking-wider uppercase">
          Next - {{ record.nextDate }}
        </div>
        <div v-if="record.nextEpsEstimate != null" class="text-mono text-xs mt-0.5">
          EPS est.
          <span class="font-semibold text-[var(--tape-text)]">
            {{ record.nextEpsEstimate.toFixed(2) }}
          </span>
          <span v-if="record.nextEpsLow != null && record.nextEpsHigh != null" class="text-soft">
            ({{ record.nextEpsLow.toFixed(2) }} -{{ record.nextEpsHigh.toFixed(2) }})
          </span>
        </div>
        <div v-if="record.nextRevenueEstimate != null" class="text-mono text-xs mt-0.5">
          Rev. est.
          <span class="font-semibold text-[var(--tape-text)]">
            {{ formatRevenueCompact(record.nextRevenueEstimate) }}
          </span>
        </div>
      </div>
    </div>
  </article>
</template>
