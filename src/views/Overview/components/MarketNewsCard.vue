<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import IconNewspaper from '~icons/lucide/newspaper'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import { useNewsStore } from '@/stores/news'
import { formatRelative } from '@/utils/format'
import NewsList from '@/components/news/NewsList.vue'

/**
 * Market-wide news for the Overview page. Aggregates Yahoo's headline
 * stories across SPY/QQQ/DIA and dedupes by URL, then shows the top eight
 * to keep the home dashboard scannable.
 */

const { t } = useI18n()
const store = useNewsStore()
const { cache, lastError } = storeToRefs(store)

const market = computed(() => cache.value.get('__market__') ?? null)
const items = computed(() => market.value?.data.items ?? [])
const loading = computed(() => store.loadingFor('__market__'))
const cachedLabel = computed(() => {
  const ts = market.value?.fetchedAt
  return ts ? formatRelative(new Date(ts).toISOString()) : null
})

onMounted(() => void store.loadMarket(false))

function refresh(): void {
  void store.loadMarket(true)
}
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-5">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconNewspaper class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">{{ t('overview.news.title') }}</h3>
        <span class="text-[10px] text-soft tracking-[0.18em] uppercase">
          {{ t('overview.news.source') }}
        </span>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted">
        <span v-if="cachedLabel" class="text-[11px] text-soft hidden sm:block">
          {{ t('overview.news.cached', { time: cachedLabel }) }}
        </span>
        <button
          class="btn-ghost h-8 px-3 text-xs"
          :disabled="loading"
          :title="t('overview.news.refreshTip')"
          @click="refresh"
        >
          <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
          {{ t('overview.news.refresh') }}
        </button>
      </div>
    </header>

    <div
      v-if="lastError && !items.length"
      class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="flex-1 text-[var(--tape-down)] min-w-0 truncate">{{ lastError }}</div>
      <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="refresh">
        {{ t('overview.news.retry') }}
      </button>
    </div>

    <div v-if="!items.length && loading" class="space-y-2">
      <div v-for="n in 5" :key="n" class="h-20 skeleton rounded-xl" />
    </div>

    <NewsList
      v-else
      :items="items"
      :limit="8"
      :empty-label="t('overview.news.empty')"
    />
  </article>
</template>
