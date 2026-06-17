<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { KlineBar } from '@/types/kline'
import KlineChart from '@/components/kline/KlineChart.vue'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'

const { t } = useI18n()

defineProps<{
  bars: KlineBar[]
  intraday: boolean
  loading: boolean
  error: string | null
}>()
</script>

<template>
  <article class="surface p-3 sm:p-4">
    <div class="relative w-full" style="height: 360px">
      <KlineChart v-if="bars.length" :bars="bars" :intraday="intraday" />
      <ChartSkeleton
        v-if="loading"
        :label="t('indicators.loadingPriceChart')"
        :class="bars.length ? 'opacity-40' : undefined"
      />
      <div
        v-else-if="!bars.length && !error"
        class="absolute inset-0 flex-center text-sm text-soft"
      >
        {{ t('indicators.pickSymbol') }}
      </div>
    </div>
  </article>
</template>
