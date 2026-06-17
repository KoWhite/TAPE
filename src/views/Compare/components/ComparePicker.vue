<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TickerSymbol } from '@/types/stock'

const { t } = useI18n()

defineProps<{
  available: TickerSymbol[]
  selectedCount: number
  maxSelected: number
}>()

const emit = defineEmits<{ toggle: [code: string] }>()
</script>

<template>
  <div v-if="available.length" class="flex flex-wrap items-center gap-2">
    <span class="text-[10px] uppercase tracking-wider text-soft mr-1">
      {{ t('compare.add') }}
    </span>
    <button
      v-for="t in available"
      :key="t.code"
      class="pill border border-[var(--tape-border)] bg-[var(--tape-button-bg)] text-muted hover:bg-[var(--tape-button-hover-bg)] hover:text-[var(--tape-text)] hover:border-[var(--tape-accent)] transition-colors"
      :disabled="selectedCount >= maxSelected"
      :class="selectedCount >= maxSelected && 'opacity-40 cursor-not-allowed'"
      @click="emit('toggle', t.code)"
    >
      {{ t.symbol }}
    </button>
  </div>
</template>
