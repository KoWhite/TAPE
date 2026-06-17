<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconCalendarClock from '~icons/lucide/calendar-clock'
import { formatRevenueCompact as formatRevenue } from '@/utils/format'
import { beatLabel as beatLabelRaw, combinedBeat as combinedBeatRaw } from '../utils'
import type { EarningsTodayRow } from '../types'

const { t } = useI18n()

// Bind the translator so the template can call these with just the numbers.
const beatLabel = (pct: number | null) => beatLabelRaw(pct, t)
const combinedBeat = (eps: number | null, rev: number | null) => combinedBeatRaw(eps, rev, t)

defineProps<{ rows: EarningsTodayRow[] }>()
defineEmits<{ (e: 'open', code: string): void }>()
</script>

<template>
  <section
    v-if="rows.length"
    class="surface p-5 sm:p-6 ring-1 ring-[var(--tape-accent)]/30"
  >
    <header class="flex items-center gap-2 mb-4">
      <IconCalendarClock class="size-4 text-[var(--tape-accent)]" />
      <h3 class="font-semibold tracking-tight">{{ t('earnings.today.title') }}</h3>
      <span class="text-[10px] text-soft tracking-wider uppercase ml-1">
        {{ t('earnings.today.reporting', { count: rows.length }) }}
      </span>
    </header>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="row in rows"
        :key="row.code"
        class="surface surface-hover p-4 cursor-pointer"
        @click="$emit('open', row.code)"
      >
        <div class="flex-between gap-2 mb-3">
          <div class="min-w-0">
            <div class="font-semibold tracking-tight">{{ row.symbol }}</div>
            <div class="text-[10px] text-soft tracking-wider uppercase">{{ row.code }}</div>
          </div>
          <span
            v-if="row.phase === 'post'"
            class="pill"
            :class="{
              'pill-up': combinedBeat(row.epsSurprisePct, row.revenueSurprisePct).kind === 'beat',
              'pill-down': combinedBeat(row.epsSurprisePct, row.revenueSurprisePct).kind === 'miss',
              'pill-flat': ['inLine', 'na'].includes(combinedBeat(row.epsSurprisePct, row.revenueSurprisePct).kind),
            }"
          >
            {{ combinedBeat(row.epsSurprisePct, row.revenueSurprisePct).text }}
          </span>
          <span v-else class="pill pill-flat">
            <IconCalendarClock class="size-3" />
            {{ t('earnings.today.reportingBadge') }}
          </span>
        </div>

        <div v-if="row.phase === 'post'" class="grid grid-cols-2 gap-3 text-xs">
          <div class="space-y-1.5">
            <div class="text-[10px] text-soft uppercase tracking-wider">{{ t('earnings.today.eps') }}</div>
            <div class="flex-between">
              <span class="text-soft text-[10px]">{{ t('earnings.today.actual') }}</span>
              <span class="text-mono font-semibold" :class="beatLabel(row.epsSurprisePct).tone">
                {{ row.epsActual?.toFixed(2) ?? '--' }}
              </span>
            </div>
            <div class="flex-between">
              <span class="text-soft text-[10px]">{{ t('earnings.today.est') }}</span>
              <span class="text-mono text-soft">{{ row.epsEstimate?.toFixed(2) ?? '--' }}</span>
            </div>
            <div v-if="row.epsSurprisePct !== null" class="flex-between pt-1 border-t border-[var(--tape-border)]">
              <span class="text-soft text-[10px]">{{ t('earnings.today.surprise') }}</span>
              <span class="text-mono" :class="beatLabel(row.epsSurprisePct).tone">
                {{ row.epsSurprisePct > 0 ? '+' : '' }}{{ row.epsSurprisePct.toFixed(2) }}%
              </span>
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="text-[10px] text-soft uppercase tracking-wider">{{ t('earnings.today.revenue') }}</div>
            <div class="flex-between">
              <span class="text-soft text-[10px]">{{ t('earnings.today.actual') }}</span>
              <span class="text-mono font-semibold" :class="beatLabel(row.revenueSurprisePct).tone">
                {{ formatRevenue(row.revenueActual) }}
              </span>
            </div>
            <div class="flex-between">
              <span class="text-soft text-[10px]">{{ t('earnings.today.est') }}</span>
              <span class="text-mono text-soft">{{ formatRevenue(row.revenueEstimate) }}</span>
            </div>
            <div v-if="row.revenueSurprisePct !== null" class="flex-between pt-1 border-t border-[var(--tape-border)]">
              <span class="text-soft text-[10px]">{{ t('earnings.today.surprise') }}</span>
              <span class="text-mono" :class="beatLabel(row.revenueSurprisePct).tone">
                {{ row.revenueSurprisePct > 0 ? '+' : '' }}{{ row.revenueSurprisePct.toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-3 text-xs">
          <div class="space-y-1.5">
            <div class="text-[10px] text-soft uppercase tracking-wider">{{ t('earnings.today.epsEst') }}</div>
            <div class="text-mono font-semibold text-sm">
              {{ row.epsEstimate?.toFixed(2) ?? '--' }}
            </div>
            <div v-if="row.epsEstimateRange" class="text-mono text-[10px] text-soft">
              {{ row.epsEstimateRange.low.toFixed(2) }} -{{ row.epsEstimateRange.high.toFixed(2) }}
            </div>
          </div>
          <div class="space-y-1.5">
            <div class="text-[10px] text-soft uppercase tracking-wider">{{ t('earnings.today.revenueEst') }}</div>
            <div class="text-mono font-semibold text-sm">
              {{ formatRevenue(row.revenueEstimate) }}
            </div>
            <div v-if="row.revenueEstimateRange" class="text-mono text-[10px] text-soft">
              {{ formatRevenue(row.revenueEstimateRange.low) }} -{{ formatRevenue(row.revenueEstimateRange.high) }}
            </div>
          </div>
          <div class="col-span-2 text-[10px] text-soft pt-1 border-t border-[var(--tape-border)]">
            {{ t('earnings.today.actualsHint') }}
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
