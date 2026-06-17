<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconBeaker from '~icons/lucide/beaker'
import IconRefreshCw from '~icons/lucide/refresh-cw'

const { t } = useI18n()

defineProps<{ loading: boolean }>()
defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <div class="flex-between flex-wrap gap-3">
    <div>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
        <IconBeaker class="size-5 text-[var(--tape-accent)]" />
        {{ t('indicators.title') }}
      </h2>
      <p class="text-xs text-muted mt-1">
        {{ t('indicators.subtitle') }}
      </p>
    </div>
    <button
      class="btn-ghost h-8 px-3 text-xs"
      :disabled="loading"
      @click="$emit('refresh')"
    >
      <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
      {{ t('indicators.refresh') }}
    </button>
  </div>
</template>
