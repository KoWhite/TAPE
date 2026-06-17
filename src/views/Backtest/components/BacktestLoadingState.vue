<script setup lang="ts">
import { ChartSkeleton } from '@/components/ui/chart-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <article class="surface p-4 sm:p-5 space-y-3">
    <div class="flex items-center justify-between">
      <Skeleton class="h-4 w-28" />
      <Skeleton class="h-4 w-36" />
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Skeleton v-for="n in 8" :key="n" class="h-16" />
    </div>
  </article>

  <article class="surface p-4 sm:p-5 space-y-3">
    <div class="flex items-center gap-2">
      <Skeleton class="h-4 w-36" />
      <Skeleton class="h-3 w-20" />
    </div>
    <div class="relative h-80">
      <ChartSkeleton label="Running backtest" />
    </div>
  </article>

  <article class="surface p-4 sm:p-5 space-y-3">
    <div class="flex items-center justify-between">
      <Skeleton class="h-4 w-20" />
      <Skeleton class="h-3 w-16" />
    </div>
    <div class="space-y-2">
      <Skeleton v-for="n in 5" :key="n" class="h-9" />
    </div>
  </article>
</template>
