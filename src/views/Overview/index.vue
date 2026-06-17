<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconLayoutDashboard from '~icons/lucide/layout-dashboard'
import IconChevronDown from '~icons/lucide/chevron-down'
import AiDailyBriefCard from './components/AiDailyBriefCard.vue'
import AiPortfolioActionsCard from './components/AiPortfolioActionsCard.vue'
import FearGreedCard from './components/FearGreedCard.vue'
import PolymarketTopCard from './components/PolymarketTopCard.vue'
import PortfolioSummaryCard from './components/PortfolioSummaryCard.vue'
import MarketNewsCard from './components/MarketNewsCard.vue'
import MarketHeatmapCard from './components/MarketHeatmapCard.vue'
import SectorHeatmapCard from './components/SectorHeatmapCard.vue'
import TodayFocusCard from './components/TodayFocusCard.vue'

/**
 * Home dashboard. Designed to answer "what's the market mood, and how am
 * I positioned in it?" at a glance -Fear & Greed sets the macro
 * backdrop, portfolio summary tells the user where they stand against it.
 */

const { t, locale } = useI18n()

const greeting = computed<string>(() => {
  const h = new Date().getHours()
  if (h < 5) return t('overview.greeting.lateNight')
  if (h < 12) return t('overview.greeting.morning')
  if (h < 18) return t('overview.greeting.afternoon')
  return t('overview.greeting.evening')
})

const todayLabel = computed<string>(() => {
  return new Date().toLocaleDateString(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
})

const showMarketContext = ref(false)
</script>

<template>
  <div class="space-y-6">
    <header class="flex-between flex-wrap gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
          <IconLayoutDashboard class="size-5 text-[var(--tape-accent)]" />
          {{ greeting }}
        </h2>
        <p class="text-xs text-muted mt-1">
          {{ todayLabel }} · {{ t('overview.subtitle') }}
        </p>
      </div>
    </header>

    <TodayFocusCard />

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6 items-start">
      <FearGreedCard />
      <AiDailyBriefCard />
    </div>

    <PortfolioSummaryCard />

    <AiPortfolioActionsCard />

    <section class="space-y-4">
      <div class="flex-between gap-3 flex-wrap">
        <div>
          <h3 class="text-sm font-semibold tracking-tight flex items-center gap-2">
            <span class="size-2 rounded-full bg-[var(--tape-info)]" />
            {{ t('overview.marketContext') }}
          </h3>
          <p class="text-xs text-muted mt-0.5">
            {{ t('overview.marketContextHint') }}
          </p>
        </div>
        <button
          class="h-8 px-3 rounded-xl inline-flex items-center justify-center gap-2 text-xs font-medium bg-[var(--tape-info-soft)] text-[var(--tape-info)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
          @click="showMarketContext = !showMarketContext"
        >
          <IconChevronDown
            class="size-3.5 transition-transform"
            :class="showMarketContext && 'rotate-180'"
          />
          {{ showMarketContext ? t('overview.hideContext') : t('overview.showContext') }}
        </button>
      </div>

      <div v-if="showMarketContext" class="space-y-6">
        <SectorHeatmapCard />
        <MarketHeatmapCard />
        <MarketNewsCard />
        <PolymarketTopCard />
      </div>
    </section>
  </div>
</template>
