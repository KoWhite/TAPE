<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import IconSearch from '~icons/lucide/search'
import IconPlus from '~icons/lucide/plus'
import IconCheck from '~icons/lucide/check'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import { useIndicatorsStore } from '@/stores/indicators'
import type { IndicatorCategory, IndicatorMeta } from '@/types/indicator'

/**
 * Browse-and-add indicator picker. Categorized scrollable list -user
 * clicks one to emit `select`. The host (IndicatorLab) is responsible
 * for translating that into a new active instance with default params.
 *
 * Selected ids are passed in via `selected` so we can render an inline
 * "Added" affordance instead of duplicating the indicator on a second
 * tap. We don't filter selected ones out of the list -toggling is the
 * expected interaction.
 */

interface Props {
  selected: string[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { t } = useI18n()
const store = useIndicatorsStore()
const { catalog, catalogLoading, catalogError } = storeToRefs(store)

onMounted(() => void store.loadCatalog(false))

const query = ref('')

interface CategorySection {
  id: IndicatorCategory
  label: string
  items: IndicatorMeta[]
}

const CATEGORY_LABELS = computed<Record<IndicatorCategory, string>>(() => ({
  trend: t('indicators.categories.trend'),
  momentum: t('indicators.categories.momentum'),
  volatility: t('indicators.categories.volatility'),
  volume: t('indicators.categories.volume'),
}))

const sections = computed<CategorySection[]>(() => {
  const q = query.value.trim().toLowerCase()
  const filtered = q
    ? catalog.value.filter(
        (m) =>
          m.id.includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      )
    : catalog.value

  // Bucket by category, preserving registry order within each.
  const buckets = new Map<IndicatorCategory, IndicatorMeta[]>()
  for (const m of filtered) {
    if (!buckets.has(m.category)) buckets.set(m.category, [])
    buckets.get(m.category)!.push(m)
  }
  const out: CategorySection[] = []
  for (const cat of ['trend', 'momentum', 'volatility', 'volume'] as const) {
    const items = buckets.get(cat)
    if (items?.length) out.push({ id: cat, label: CATEGORY_LABELS[cat], items })
  }
  return out
})

function isSelected(id: string): boolean {
  return props.selected.includes(id)
}
</script>

<template>
  <div class="space-y-3">
    <!-- Search -->
    <div class="relative">
      <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-soft" />
      <input
        v-model="query"
        type="text"
        placeholder="Search indicators..."
        class="w-full pl-9 pr-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-sm focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
      />
    </div>

    <!-- Error -->
    <div
      v-if="catalogError && !catalog.length"
      class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="flex-1 text-[var(--tape-down)] min-w-0 truncate">{{ catalogError }}</div>
      <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="store.loadCatalog(true)">
        Retry
      </button>
    </div>

    <!-- Loading -->
    <div v-if="!catalog.length && catalogLoading" class="space-y-2">
      <div v-for="n in 6" :key="n" class="h-12 skeleton rounded-lg" />
    </div>

    <!-- Categorized list -->
    <div v-if="sections.length" class="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
      <section v-for="sec in sections" :key="sec.id">
        <h4 class="text-[10px] uppercase tracking-[0.18em] text-soft font-semibold mb-2">
          {{ sec.label }}
        </h4>
        <ul class="space-y-1">
          <li v-for="m in sec.items" :key="m.id">
            <button
              class="w-full text-left rounded-lg border border-[var(--tape-border)] bg-[var(--tape-button-bg)] hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-button-hover-bg)] px-3 py-2.5 transition-colors group"
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
                  <p
                    v-if="m.description"
                    class="text-xs text-muted mt-0.5 leading-snug"
                  >
                    {{ m.description }}
                  </p>
                </div>
                <span
                  class="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 h-6 rounded-md transition-colors"
                  :class="
                    isSelected(m.id)
                      ? 'bg-[var(--tape-accent)] text-[var(--tape-bg)]'
                      : 'text-soft group-hover:text-[var(--tape-text)] border border-[var(--tape-border)]'
                  "
                >
                  <component
                    :is="isSelected(m.id) ? IconCheck : IconPlus"
                    class="size-3"
                  />
                  {{ isSelected(m.id) ? 'Added' : 'Add' }}
                </span>
              </div>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- Empty search result -->
    <div v-else-if="!catalogLoading && catalog.length" class="text-center py-8 text-sm text-soft">
            No indicators match "{{ query }}"
    </div>
  </div>
</template>
