<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconPlus from '~icons/lucide/plus'
import IconTrash2 from '~icons/lucide/trash-2'
import IndicatorParamForm from './IndicatorParamForm.vue'
import IndicatorPane from './IndicatorPane.vue'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'
import type { IndicatorPaneView } from '../types'

const { t } = useI18n()

defineProps<{ panes: IndicatorPaneView[] }>()

defineEmits<{
  (e: 'remove', id: string): void
  (e: 'update-params', id: string, params: Record<string, number>): void
  (e: 'add'): void
}>()
</script>

<template>
  <article
    v-for="p in panes"
    :key="p.inst.indicatorId"
    class="surface p-4 sm:p-5 space-y-4"
  >
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2 min-w-0">
        <h3 class="text-sm font-semibold tracking-tight truncate">
          {{ p.meta?.name ?? p.inst.indicatorId }}
        </h3>
        <span class="text-mono text-[10px] tracking-[0.18em] uppercase text-soft">
          {{ p.inst.indicatorId }} - {{ p.meta?.category }}
        </span>
      </div>
      <button
        class="size-7 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)] transition-colors"
        :title="t('indicators.removeIndicator')"
        @click="$emit('remove', p.inst.indicatorId)"
      >
        <IconTrash2 class="size-3.5" />
      </button>
    </header>

    <IndicatorParamForm
      v-if="p.meta"
      :meta="p.meta"
      :model-value="p.inst.params"
      @update:model-value="$emit('update-params', p.inst.indicatorId, $event)"
    />

    <div v-if="p.result">
      <IndicatorPane :result="p.result" :height="160" />
    </div>
    <div v-else-if="p.loading" class="relative h-40">
      <ChartSkeleton :label="t('indicators.computing')" dense />
    </div>
    <div v-else class="h-40 flex-center text-xs text-soft">
      {{ t('indicators.waitingForData') }}
    </div>
  </article>

  <button
    class="w-full surface p-5 flex items-center justify-center gap-2 text-soft hover:text-[var(--tape-accent)] hover:border-[var(--tape-border-hover)] transition-colors"
    @click="$emit('add')"
  >
    <IconPlus class="size-4" />
    {{ t('indicators.addIndicator') }}
  </button>
</template>
