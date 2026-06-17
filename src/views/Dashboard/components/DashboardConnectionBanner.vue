<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  error: string
  consecutiveFailures: number
  retryInSeconds: number | null
  loading: boolean
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div
    class="surface px-4 py-3 flex items-center gap-3 text-sm text-[var(--tape-down)] border-[var(--tape-down-soft)]"
  >
    <IconLucideTriangleAlert class="size-4 shrink-0" />
    <div class="flex-1 min-w-0">
      <div class="truncate">{{ error }}</div>
      <div v-if="retryInSeconds !== null" class="text-[11px] text-soft mt-0.5">
        {{ t('watchlist.banner.failed', { count: consecutiveFailures }) }}
        <template v-if="retryInSeconds > 0">
          {{ t('watchlist.banner.retryingIn', { seconds: retryInSeconds }) }}
        </template>
        <template v-else>{{ t('watchlist.banner.retrying') }}</template>
      </div>
    </div>
    <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="emit('retry')">
      <IconLucideRefreshCw class="size-3" :class="loading && 'animate-spin'" />
      {{ t('watchlist.banner.retryNow') }}
    </button>
  </div>
</template>
