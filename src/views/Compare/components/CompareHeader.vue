<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ComparePeriod } from '../types'

const { t } = useI18n()

defineProps<{
  periods: ComparePeriod[]
  period: ComparePeriod
  loading: boolean
}>()

const emit = defineEmits<{
  'update:period': [value: ComparePeriod]
  refresh: []
}>()
</script>

<template>
  <div class="flex-between flex-wrap gap-3">
    <div>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">{{ t('compare.title') }}</h2>
      <p class="text-xs text-muted mt-1">
        {{ t('compare.subtitle') }}
      </p>
    </div>
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
        @click="emit('update:period', p)"
      >
        {{ p.label }}
      </button>
      <button
        class="btn-ghost h-8 px-3 text-xs"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <IconLucideRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
        {{ t('compare.refresh') }}
      </button>
    </div>
  </div>
</template>
