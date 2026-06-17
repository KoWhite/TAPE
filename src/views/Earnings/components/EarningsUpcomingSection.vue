<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconCalendarClock from '~icons/lucide/calendar-clock'
import type { Quote } from '@/types/stock'
import { formatRevenueCompact as formatRevenue } from '@/utils/format'
import { dayLabel as dayLabelRaw, dayTone } from '../utils'
import type { EarningsRow, EarningsWeekGroup } from '../types'

const { t, locale } = useI18n()
const dayLabel = (row: EarningsRow) =>
  dayLabelRaw(row, t, locale.value === 'zh' ? 'zh-CN' : 'en-US')

defineProps<{
  groups: EarningsWeekGroup[]
  count: number
  quotes: Map<string, Quote>
}>()

defineEmits<{ (e: 'open', code: string): void }>()
</script>

<template>
  <section class="surface p-5 sm:p-6">
    <header class="flex items-center gap-2 mb-4">
      <IconCalendarClock class="size-4 text-[var(--tape-accent)]" />
      <h3 class="font-semibold tracking-tight">{{ t('earnings.upcoming.title') }}</h3>
      <span class="text-[10px] text-soft tracking-wider uppercase ml-1">
        {{ t('earnings.upcoming.reports', count) }}
      </span>
    </header>

    <div v-if="groups.length" class="space-y-5">
      <div v-for="group in groups" :key="group.startISO" class="space-y-2">
        <div class="text-[10px] uppercase tracking-wider text-soft pl-2">
          {{ group.label }}
        </div>
        <ul class="divide-y divide-[var(--tape-border)]">
          <li
            v-for="row in group.rows"
            :key="row.code"
            class="py-2.5 flex-between gap-3 -mx-2 px-2 rounded-lg cursor-pointer hover:bg-[var(--tape-surface-hover-bg)] transition-colors"
            :class="row.daysFromToday === 0 && 'bg-[var(--tape-down-soft)]/30 ring-1 ring-[var(--tape-down-soft)]'"
            @click="$emit('open', row.code)"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="text-right text-mono text-xs w-20 shrink-0" :class="dayTone(row)">
                {{ dayLabel(row) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold tracking-tight">{{ row.symbol }}</div>
                <div class="text-[10px] text-soft tracking-wider uppercase">
                  {{ row.code }} - {{ row.date }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-4 text-right shrink-0">
              <div v-if="row.record.nextEpsEstimate != null" class="hidden sm:block">
                <div class="text-[10px] text-soft uppercase tracking-wider">{{ t('earnings.upcoming.epsEst') }}</div>
                <div class="text-mono text-sm font-medium">
                  {{ row.record.nextEpsEstimate.toFixed(2) }}
                </div>
              </div>
              <div v-if="row.record.nextRevenueEstimate != null" class="hidden md:block">
                <div class="text-[10px] text-soft uppercase tracking-wider">{{ t('earnings.upcoming.revEst') }}</div>
                <div class="text-mono text-sm font-medium">
                  {{ formatRevenue(row.record.nextRevenueEstimate) }}
                </div>
              </div>
              <div class="text-mono text-xs text-soft min-w-12">
                <div class="text-[10px] uppercase tracking-wider">{{ t('earnings.upcoming.last') }}</div>
                <span v-if="quotes.get(row.code)?.last">
                  {{ quotes.get(row.code)!.last.toFixed(2) }}
                </span>
                <span v-else>--</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <p v-else class="text-sm text-soft py-6 text-center">
      {{ t('earnings.upcoming.empty') }}
    </p>
  </section>
</template>
