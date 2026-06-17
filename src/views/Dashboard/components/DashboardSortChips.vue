<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

type SortKey = 'symbol' | 'changePct' | 'last'

defineProps<{
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
}>()

const emit = defineEmits<{
  toggle: [key: SortKey]
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-[10px] uppercase tracking-wider text-soft mr-1">
      {{ t('watchlist.sort.label') }}
    </span>
    <button
      v-for="key in ['symbol', 'changePct', 'last'] as const"
      :key="key"
      class="pill border transition-colors"
      :class="
        sortKey === key
          ? 'border-[var(--tape-accent)] bg-[var(--tape-button-hover-bg)] text-[var(--tape-accent)]'
          : 'border-[var(--tape-border)] bg-[var(--tape-button-bg)] text-muted hover:bg-[var(--tape-button-hover-bg)] hover:text-[var(--tape-text)]'
      "
      @click="emit('toggle', key)"
    >
      {{ key === 'changePct' ? t('watchlist.sort.changePct') : key === 'last' ? t('watchlist.sort.price') : t('watchlist.sort.symbol') }}
      <template v-if="sortKey === key">
        <IconLucideArrowUp v-if="sortDir === 'asc'" class="size-3" />
        <IconLucideArrowDown v-else class="size-3" />
      </template>
    </button>
  </div>
</template>
