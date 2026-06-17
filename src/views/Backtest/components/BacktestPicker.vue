<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import IconCheck from '~icons/lucide/check'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import { useBacktestsStore } from '@/stores/backtests'
import type { StrategyCategory, StrategyMeta } from '@/types/backtest'

/**
 * Strategy picker -categorized list, click to select. Unlike the
 * indicator picker (which supports adding many), only one strategy is
 * "active" at a time in the Backtest view, so this acts as a radio.
 */

interface Props {
  /** Currently selected strategy id, for the check-mark affordance. */
  selected: string | null
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const store = useBacktestsStore()
const { catalog, catalogLoading, catalogError } = storeToRefs(store)

onMounted(() => void store.loadCatalog())

const CATEGORY_LABELS: Record<StrategyCategory, string> = {
  baseline: 'Baseline',
  trend: 'Trend Following',
  mean_reversion: 'Mean Reversion',
  systematic: 'Systematic',
  event: 'Event-Driven',
  ai: 'AI',
}

interface Section {
  id: StrategyCategory
  label: string
  items: StrategyMeta[]
}

const sections = computed<Section[]>(() => {
  const buckets = new Map<StrategyCategory, StrategyMeta[]>()
  for (const m of catalog.value) {
    if (!buckets.has(m.category)) buckets.set(m.category, [])
    buckets.get(m.category)!.push(m)
  }
  const out: Section[] = []
  for (const cat of ['baseline', 'trend', 'mean_reversion', 'systematic', 'event'] as const) {
    const items = buckets.get(cat)
    if (items?.length) out.push({ id: cat, label: CATEGORY_LABELS[cat], items })
  }
  return out
})
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="catalogError && !catalog.length"
      class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="flex-1 text-[var(--tape-down)] truncate">{{ catalogError }}</div>
      <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="store.loadCatalog(true)">
        Retry
      </button>
    </div>

    <div v-if="!catalog.length && catalogLoading" class="space-y-2">
      <div v-for="n in 4" :key="n" class="h-14 skeleton rounded-lg" />
    </div>

    <div
      v-else-if="!catalog.length && !catalogError"
      class="surface px-4 py-5 text-sm text-soft"
    >
      No strategies are available. Check the Python bridge and strategy registry, then retry.
    </div>

    <section v-for="sec in sections" :key="sec.id">
      <h4 class="text-[10px] uppercase tracking-[0.18em] text-soft font-semibold mb-2">
        {{ sec.label }}
      </h4>
      <ul class="space-y-1.5">
        <li v-for="m in sec.items" :key="m.id">
          <button
            class="w-full text-left rounded-lg border bg-[var(--tape-button-bg)] px-3 py-2.5 transition-colors"
            :class="
              selected === m.id
                ? 'border-[var(--tape-accent)] bg-[var(--tape-accent-soft)]'
                : 'border-[var(--tape-border)] hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-button-hover-bg)]'
            "
            @click="emit('select', m.id)"
          >
            <div class="flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="text-sm font-semibold tracking-tight">{{ m.name }}</span>
                  <span class="text-mono text-[10px] uppercase tracking-wider text-soft">
                    {{ m.id }}
                  </span>
                </div>
                <p class="text-xs text-muted mt-0.5 leading-snug">
                  {{ m.description }}
                </p>
              </div>
              <span
                v-if="selected === m.id"
                class="shrink-0 size-6 rounded-md bg-[var(--tape-accent)] text-[var(--tape-bg)] flex-center"
              >
                <IconCheck class="size-3.5" />
              </span>
            </div>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
