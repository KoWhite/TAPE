<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CompareChart, { type CompareSeries } from '@/components/kline/CompareChart.vue'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'

const { t } = useI18n()

defineProps<{
  series: CompareSeries[]
  loading: boolean
}>()
</script>

<template>
  <article class="surface p-3 sm:p-4">
    <div class="relative w-full" style="height: 520px">
      <CompareChart v-if="series.length" :series="series" />
      <ChartSkeleton
        v-if="loading"
        :label="t('compare.loadingChart')"
        :class="series.length ? 'opacity-40' : undefined"
      />
      <div
        v-else-if="!series.length"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6"
      >
        <IconLucideLineChart class="size-8 text-soft" />
        <p class="text-sm text-soft max-w-md">
          {{ t('compare.pickPrompt') }}
        </p>
      </div>
    </div>
  </article>
</template>
