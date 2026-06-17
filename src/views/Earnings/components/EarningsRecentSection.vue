<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconCalendarCheck from '~icons/lucide/calendar-check'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconTrendingUp from '~icons/lucide/trending-up'
import type { EarningsRow } from '../types'

const { t } = useI18n()

defineProps<{ rows: EarningsRow[] }>()
defineEmits<{ (e: 'open', code: string): void }>()
</script>

<template>
  <section class="surface p-5 sm:p-6">
    <header class="flex items-center gap-2 mb-4">
      <IconCalendarCheck class="size-4 text-[var(--tape-accent)]" />
      <h3 class="font-semibold tracking-tight">{{ t('earnings.recent.title') }}</h3>
      <span class="text-[10px] text-soft tracking-wider uppercase ml-1">
        {{ t('earnings.recent.last30', { count: rows.length }) }}
      </span>
    </header>

    <div v-if="rows.length" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
            <th class="text-left font-medium px-3 py-2">{{ t('earnings.recent.colDate') }}</th>
            <th class="text-left font-medium px-3 py-2">{{ t('earnings.recent.colSymbol') }}</th>
            <th class="text-right font-medium px-3 py-2">{{ t('earnings.recent.colEpsEst') }}</th>
            <th class="text-right font-medium px-3 py-2">{{ t('earnings.recent.colEpsActual') }}</th>
            <th class="text-right font-medium px-3 py-2">{{ t('earnings.recent.colSurprise') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.code"
            class="border-b border-[var(--tape-border)] last:border-b-0 hover:bg-[var(--tape-surface-hover-bg)] cursor-pointer transition-colors"
            @click="$emit('open', row.code)"
          >
            <td class="px-3 py-2.5 text-mono text-soft">{{ row.date }}</td>
            <td class="px-3 py-2.5">
              <div class="font-semibold tracking-tight">{{ row.symbol }}</div>
              <div class="text-[10px] text-soft tracking-wider uppercase">{{ row.code }}</div>
            </td>
            <td class="text-mono text-right px-3 py-2.5 text-soft">
              {{ row.record.history[0]?.epsEstimate?.toFixed(2) ?? '--' }}
            </td>
            <td class="text-mono text-right px-3 py-2.5">
              {{ row.record.history[0]?.epsActual?.toFixed(2) ?? '--' }}
            </td>
            <td class="text-mono text-right px-3 py-2.5">
              <span
                v-if="row.record.history[0]?.surprisePct !== null && row.record.history[0]?.surprisePct !== undefined"
                class="inline-flex items-center gap-1"
                :class="
                  row.record.history[0]!.surprisePct! > 0
                    ? 'text-[var(--tape-up)]'
                    : row.record.history[0]!.surprisePct! < 0
                    ? 'text-[var(--tape-down)]'
                    : 'text-soft'
                "
              >
                <component
                  :is="row.record.history[0]!.surprisePct! >= 0 ? IconTrendingUp : IconTrendingDown"
                  class="size-3"
                />
                {{ row.record.history[0]!.surprisePct! > 0 ? '+' : '' }}{{ row.record.history[0]!.surprisePct!.toFixed(2) }}%
              </span>
              <span v-else class="text-soft">--</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="text-sm text-soft py-6 text-center">
      {{ t('earnings.recent.empty') }}
    </p>
  </section>
</template>
