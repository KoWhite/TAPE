<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import DashboardWatchlistManager from './DashboardWatchlistManager.vue'

const { t } = useI18n()

defineProps<{
  symbolCount: number
  loading: boolean
  lastSyncLabel: string
  compactMode: boolean
  activeCategoryId?: string | null
}>()

const emit = defineEmits<{
  toggleCompact: []
  refresh: []
}>()
</script>

<template>
  <div class="flex-between flex-wrap gap-2 sm:gap-3">
    <div class="flex items-center gap-2">
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">
        {{ t('watchlist.title') }}
      </h2>
      <span class="pill border border-[var(--tape-border)]">
        {{ t('watchlist.symbols', symbolCount) }}
      </span>
    </div>

    <div class="flex items-center gap-1.5 sm:gap-2 text-xs text-muted min-w-0">
      <IconSvgSpinners180RingWithBg
        v-if="loading"
        class="size-3.5 text-[var(--tape-accent)]"
      />
      <span class="hidden xs:inline whitespace-nowrap">{{ t('watchlist.toolbar.updated', { time: lastSyncLabel }) }}</span>
      <button
        class="btn-ghost h-8 px-2 sm:px-3 text-xs"
        :title="compactMode ? t('watchlist.toolbar.toDetail') : t('watchlist.toolbar.toCompact')"
        @click="emit('toggleCompact')"
      >
        <IconLucideLayoutGrid v-if="compactMode" class="size-3.5" />
        <IconLucideList v-else class="size-3.5" />
        <span class="hidden sm:inline">{{ compactMode ? t('watchlist.toolbar.detail') : t('watchlist.toolbar.compact') }}</span>
      </button>
      <button
        class="btn-ghost h-8 px-2 sm:px-3 text-xs"
        :title="t('watchlist.toolbar.refresh')"
        @click="emit('refresh')"
      >
        <IconLucideRefreshCw class="size-3.5" />
        <span class="hidden sm:inline">{{ t('watchlist.toolbar.refresh') }}</span>
      </button>
      <DashboardWatchlistManager :active-category-id="activeCategoryId" />
    </div>
  </div>
</template>
