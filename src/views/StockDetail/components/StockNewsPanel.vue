<script setup lang="ts">
import IconNewspaper from '~icons/lucide/newspaper'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import type { NewsItem } from '@/types/news'
import NewsList from '@/components/news/NewsList.vue'

defineProps<{
  items: NewsItem[]
  loading: boolean
  emptyLabel: string
}>()

defineEmits<{ (e: 'refresh'): void }>()
</script>

<template>
  <article v-if="items.length || loading" class="surface p-5 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconNewspaper class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">News</h3>
        <span class="text-[10px] text-soft tracking-[0.18em] uppercase">
          Yahoo Finance
        </span>
      </div>
      <button class="btn-ghost h-8 px-3 text-xs" :disabled="loading" @click="$emit('refresh')">
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
        Refresh
      </button>
    </header>
    <div v-if="!items.length && loading" class="space-y-2">
      <div v-for="n in 4" :key="n" class="h-20 skeleton rounded-xl" />
    </div>
    <NewsList v-else :items="items" :limit="12" :empty-label="emptyLabel" />
  </article>
</template>
