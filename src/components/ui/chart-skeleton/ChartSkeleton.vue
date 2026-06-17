<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(defineProps<{
  label?: string
  dense?: boolean
  class?: string
}>(), {
  label: 'Loading chart',
  dense: false,
})
</script>

<template>
  <div
    class="absolute inset-0 overflow-hidden rounded-xl border border-[var(--tape-border)] bg-[var(--tape-surface)]/92 p-4"
    :class="$props.class"
    aria-busy="true"
  >
    <div class="h-full w-full grid grid-cols-[1fr_auto] grid-rows-[auto_1fr_auto] gap-3">
      <div class="flex items-center gap-2">
        <Skeleton class="h-3 w-28 rounded-full" />
        <Skeleton class="h-3 w-16 rounded-full opacity-70" />
      </div>
      <Skeleton class="h-3 w-12 rounded-full" />

      <div class="relative col-span-2 overflow-hidden rounded-lg border border-[var(--tape-border)] bg-[var(--tape-input)]/60">
        <div class="absolute inset-0 grid grid-rows-4">
          <span
            v-for="n in 4"
            :key="n"
            class="border-b border-[var(--tape-border)]/60 last:border-b-0"
          />
        </div>
        <div class="absolute inset-0 grid grid-cols-6">
          <span
            v-for="n in 6"
            :key="n"
            class="border-r border-[var(--tape-border)]/50 last:border-r-0"
          />
        </div>
        <div class="absolute left-5 right-6 top-[18%] h-[36%]">
          <Skeleton class="absolute left-0 top-[55%] h-2 w-[22%] rotate-[-6deg] rounded-full" />
          <Skeleton class="absolute left-[18%] top-[42%] h-2 w-[26%] rotate-[8deg] rounded-full" />
          <Skeleton class="absolute left-[40%] top-[52%] h-2 w-[28%] rotate-[-10deg] rounded-full" />
          <Skeleton class="absolute left-[64%] top-[36%] h-2 w-[30%] rotate-[7deg] rounded-full" />
        </div>
        <div v-if="!dense" class="absolute bottom-4 left-5 right-5 flex items-end gap-1.5">
          <Skeleton v-for="n in 18" :key="n" class="w-full rounded-sm opacity-60" :style="{ height: `${18 + (n % 6) * 7}px` }" />
        </div>
      </div>

      <div class="col-span-2 flex items-center justify-between gap-3">
        <span class="text-[10px] uppercase tracking-wider text-soft">{{ label }}</span>
        <div class="flex gap-1.5">
          <Skeleton v-for="n in 5" :key="n" class="h-2 w-10 rounded-full" />
        </div>
      </div>
    </div>
  </div>
</template>
