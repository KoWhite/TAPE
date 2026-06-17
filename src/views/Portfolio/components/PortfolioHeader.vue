<script setup lang="ts">
import IconCircle from '~icons/lucide/circle'
import IconPlus from '~icons/lucide/plus'
import IconRefreshCw from '~icons/lucide/refresh-cw'

defineProps<{
  positionsCount: number
  loading: boolean
  lastSyncLabel: string | null
}>()

defineEmits<{
  (e: 'refresh'): void
  (e: 'add'): void
}>()
</script>

<template>
  <div class="flex-between flex-wrap gap-3">
    <div>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">Portfolio</h2>
      <p class="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
        <span>Manual cost basis - live P&amp;L from the active data source</span>
        <span
          v-if="positionsCount"
          class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider"
          :class="loading ? 'text-[var(--tape-accent)]' : 'text-soft'"
        >
          <IconCircle
            class="size-2"
            :class="loading ? 'animate-pulse fill-current' : 'fill-current'"
          />
          {{ loading ? 'Updating' : (lastSyncLabel ? `Live - synced ${lastSyncLabel}` : 'Live') }}
        </span>
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="btn-ghost h-8 px-3 text-xs"
        :disabled="loading"
        title="Force a quote refresh now"
        @click="$emit('refresh')"
      >
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
        Refresh
      </button>
      <button class="btn-primary h-8 px-3 text-xs" @click="$emit('add')">
        <IconPlus class="size-3.5" />
        Add position
      </button>
    </div>
  </div>
</template>
