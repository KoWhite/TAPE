<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconMinus from '~icons/lucide/minus'
import type { Quote } from '@/types/stock'
import {
  direction,
  formatChange,
  formatPercent,
} from '@/utils/format'
import { pickActiveSession, SESSION_META } from '@/utils/session'
import EarningsBadge from '@/components/ui/EarningsBadge.vue'

const props = defineProps<{
  quote: Quote
  /** Re-evaluated tick to re-pick session; passed in by parent so we don't
   *  start a per-row interval. */
  clockTick?: number
}>()

defineEmits<{
  remove: [code: string]
}>()

const active = computed(() => {
  // Read clockTick to keep the computed reactive -picker uses Date.now().
  void props.clockTick
  return pickActiveSession(props.quote)
})

const dir = computed(() => direction(active.value.change))

const trendClass = computed(() => {
  if (dir.value === 'up') return 'text-[var(--tape-up)]'
  if (dir.value === 'down') return 'text-[var(--tape-down)]'
  return 'text-[var(--tape-text-soft)]'
})

const pillClass = computed(() => {
  if (dir.value === 'up') return 'pill-up'
  if (dir.value === 'down') return 'pill-down'
  return 'pill-flat'
})

const arrow = computed<Component>(() => {
  if (dir.value === 'up') return IconTrendingUp
  if (dir.value === 'down') return IconTrendingDown
  return IconMinus
})

const { t } = useI18n()

const meta = computed(() => {
  const m = SESSION_META[active.value.kind]
  const kind = active.value.kind
  return {
    icon: m.icon,
    label: t(`ticker.sessionMeta.${kind}Label`),
    shortLabel: t(`ticker.sessionMeta.${kind}Short`),
  }
})

const router = useRouter()
function openDetail(): void {
  router.push(`/stock/${encodeURIComponent(props.quote.code)}`)
}
</script>

<template>
  <article
    class="surface surface-hover px-4 py-3 group flex items-center gap-3 sm:gap-4 cursor-pointer"
    role="button"
    tabindex="0"
    @click="openDetail"
    @keydown.enter="openDetail"
  >
    <!-- Session icon -->
    <span
      class="size-8 rounded-lg flex-center bg-[var(--tape-surface-soft-bg,transparent)] border border-[var(--tape-border)] shrink-0"
      :title="meta.label + (active.fallback ? t('ticker.noLiveData') : '')"
    >
      <component :is="meta.icon" class="size-4 text-[var(--tape-accent)]" />
    </span>

    <!-- Symbol + name -->
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="font-semibold tracking-tight">{{ quote.symbol }}</span>
        <span class="text-[10px] uppercase tracking-wider text-soft">
          {{ meta.shortLabel }}
        </span>
        <EarningsBadge :code="quote.code" compact />
      </div>
      <div class="text-xs text-muted truncate">{{ quote.name }}</div>
    </div>

    <!-- Price -->
    <div class="text-mono font-semibold text-right tabular-nums w-20 sm:w-24">
      {{ active.price.toFixed(2) }}
    </div>

    <!-- Change abs + pct -->
    <div class="flex flex-col items-end gap-1 w-24 sm:w-28">
      <span :class="['text-mono text-xs', trendClass]">
        {{ formatChange(active.change) }}
      </span>
      <span :class="pillClass">
        <component :is="arrow" class="size-3" />
        {{ formatPercent(active.changePct) }}
      </span>
    </div>

    <!-- Remove -->
    <!-- <button

      class="size-7 rounded-lg flex-center text-soft opacity-0 group-hover:opacity-100 hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)] transition-all shrink-0"
      :title="`Remove ${quote.symbol}`"
      aria-label="Remove ticker"
      @click="$emit('remove', quote.code)"
    >
      <IconLucideX class="size-3.5" />
    </button> -->
  </article>
</template>
