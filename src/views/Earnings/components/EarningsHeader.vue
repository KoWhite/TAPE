<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconRefreshCw from '~icons/lucide/refresh-cw'

const { t } = useI18n()

defineProps<{
  codesCount: number
  refreshing: boolean
}>()

defineEmits<{
  (e: 'refresh'): void
}>()
</script>

<template>
  <header class="flex-between flex-wrap gap-3">
    <div>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">{{ t('earnings.title') }}</h2>
      <p class="text-sm text-muted mt-1">
        {{ t('earnings.subtitle') }}
      </p>
    </div>
    <div class="flex items-center gap-2 text-xs text-muted">
      <span class="pill border border-[var(--tape-border)]">
        {{ t('earnings.tracked', codesCount) }}
      </span>
      <button
        class="btn-ghost h-8 px-3 text-xs"
        :disabled="refreshing"
        :title="t('earnings.refreshTip')"
        @click="$emit('refresh')"
      >
        <IconRefreshCw class="size-3.5" :class="refreshing && 'animate-spin'" />
        {{ t('earnings.refresh') }}
      </button>
    </div>
  </header>
</template>
