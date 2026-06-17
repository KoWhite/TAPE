<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type { IndicatorPeriod } from '../types'

const { t } = useI18n()

defineProps<{
  codeInput: string
  periods: IndicatorPeriod[]
  period: IndicatorPeriod
  error: string | null
}>()

defineEmits<{
  (e: 'update:codeInput', value: string): void
  (e: 'apply-code'): void
  (e: 'update:period', value: IndicatorPeriod): void
}>()
</script>

<template>
  <article class="surface p-4 sm:p-5 space-y-4">
    <div class="flex items-end gap-3 flex-wrap">
      <label class="block flex-1 min-w-48">
        <span class="text-[10px] uppercase tracking-wider text-soft">{{ t('indicators.symbol') }}</span>
        <input
          :value="codeInput"
          type="text"
          :placeholder="t('indicators.symbolPlaceholder')"
          class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
          @input="$emit('update:codeInput', ($event.target as HTMLInputElement).value)"
          @keydown.enter="$emit('apply-code')"
          @blur="$emit('apply-code')"
        />
      </label>
      <div class="flex items-center gap-1">
        <button
          v-for="p in periods"
          :key="p.id"
          class="px-3 h-9 rounded-lg text-xs font-medium tracking-wide transition-colors"
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
    </div>
    <div
      v-if="error"
      class="px-3 py-2 rounded-lg flex items-start gap-2 text-xs border border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-3.5 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <span class="text-[var(--tape-down)]">{{ error }}</span>
    </div>
  </article>
</template>
