<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  kind: 'empty-watchlist' | 'empty-category'
}>()

const emit = defineEmits<{
  showAll: []
}>()
</script>

<template>
  <div
    v-if="kind === 'empty-watchlist'"
    class="surface col-center py-20 text-center px-6"
  >
    <IconLucideLineChart class="size-10 text-soft mb-3" />
    <p class="text-base font-medium">{{ t('watchlist.empty.watchlistTitle') }}</p>
    <p class="text-sm text-muted mt-1 max-w-sm">
      {{ t('watchlist.empty.watchlistHint') }}
    </p>
    <RouterLink to="/settings" class="btn-primary mt-5">
      <IconLucidePlus class="size-4" />
      {{ t('watchlist.empty.addSymbols') }}
    </RouterLink>
  </div>
  <div v-else class="surface col-center py-12 text-center px-6">
    <IconLucideFilter class="size-8 text-soft mb-2" />
    <p class="text-sm font-medium">{{ t('watchlist.empty.categoryTitle') }}</p>
    <p class="text-xs text-muted mt-1">
      {{ t('watchlist.empty.categoryHint') }}
    </p>
    <button class="btn-ghost mt-4 text-xs" @click="emit('showAll')">
      {{ t('watchlist.empty.showAll') }}
    </button>
  </div>
</template>
