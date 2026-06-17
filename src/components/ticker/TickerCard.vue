<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconMinus from '~icons/lucide/minus'
import IconSunrise from '~icons/lucide/sunrise'
import IconSunset from '~icons/lucide/sunset'
import IconMoon from '~icons/lucide/moon'
import type { Quote, SessionKind } from '@/types/stock'
import {
  direction,
  formatChange,
  formatCompact,
  formatPercent,
} from '@/utils/format'
import { useSettingsStore } from '@/stores/settings'
import PriceCell from '@/components/ui/PriceCell.vue'
import Sparkline from '@/components/ui/Sparkline.vue'
import Range52WBar from '@/components/ui/Range52WBar.vue'
import EarningsBadge from '@/components/ui/EarningsBadge.vue'

const props = defineProps<{
  quote: Quote
}>()

defineEmits<{
  remove: [code: string]
}>()

const { t } = useI18n()
const settings = useSettingsStore()

const dir = computed(() => direction(props.quote.change))

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

// Icons are static; the labels are resolved via i18n (sessionLabel) keyed by
// session kind so they follow the active locale.
const SESSION_ICON: Record<SessionKind, Component> = {
  preMarket: IconSunrise,
  afterHours: IconSunset,
  overnight: IconMoon,
}
const SESSION_LABEL_KEY: Record<SessionKind, 'pre' | 'after' | 'overnight'> = {
  preMarket: 'pre',
  afterHours: 'after',
  overnight: 'overnight',
}
function sessionLabel(kind: SessionKind): string {
  return t(`ticker.session.${SESSION_LABEL_KEY[kind]}`)
}

const router = useRouter()
function openDetail(): void {
  router.push(`/stock/${encodeURIComponent(props.quote.code)}`)
}

const extendedSessions = computed(() => {
  if (!settings.showAfterHours) return []
  const s = props.quote.sessions
  if (!s) return []
  const order: SessionKind[] = ['preMarket', 'afterHours', 'overnight']
  return order
    .map((k) => (s[k] ? { kind: k, ...s[k]! } : null))
    .filter((x): x is NonNullable<typeof x> => x !== null)
})
</script>

<template>
  <article
    class="surface surface-hover p-4 sm:p-5 group relative overflow-hidden cursor-pointer"
    role="button"
    tabindex="0"
    @click="openDetail"
    @keydown.enter="openDetail"
  >
    <!-- Top row: ticker + remove -->
    <div class="flex-between gap-3 mb-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight truncate">
            {{ quote.symbol }}
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ quote.market }} · {{ quote.type }}
          </span>
          <EarningsBadge :code="quote.code" compact />
        </div>
        <p class="text-xs text-muted truncate">{{ quote.name }}</p>
      </div>
      <!-- <button
        class="size-7 rounded-lg flex-center text-soft opacity-0 group-hover:opacity-100 hover:text-[var(--tape-down)] hover:bg-[var(--tape-down-soft)] transition-all"
        title="Remove from watchlist"
        aria-label="Remove ticker"
        @click.stop="$emit('remove', quote.code)"
      >
        <IconLucideX class="size-3.5" />
      </button> -->
    </div>

    <!-- Price + change -->
    <div class="flex items-end justify-between gap-3 mb-3">
      <PriceCell :value="quote.last" size="lg" :digits="2" />
      <div class="flex flex-col items-end gap-1">
        <span :class="['text-mono text-sm font-medium', trendClass]">
          {{ formatChange(quote.change) }}
        </span>
        <span :class="pillClass">
          <component :is="arrow" class="size-3" />
          {{ formatPercent(quote.changePct) }}
        </span>
      </div>
    </div>

    <!-- Sparkline + stats -->
    <div class="flex items-center justify-between gap-4">
      <Sparkline
        v-if="quote.history?.length"
        :points="quote.history"
        :width="140"
        :height="34"
        class="flex-1 min-w-0"
      />
    </div>

    <!-- 52-week range -->
    <Range52WBar
      v-if="quote.high52w && quote.low52w"
      :last="quote.last"
      :high="quote.high52w"
      :low="quote.low52w"
      class="mt-3"
    />

    <!-- Stats grid -->
    <dl
      class="mt-4 pt-3 border-t border-[var(--tape-border)] grid grid-cols-3 gap-2 text-xs"
    >
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">{{ t('ticker.open') }}</dt>
        <dd class="text-mono mt-0.5">{{ quote.open.toFixed(2) }}</dd>
      </div>
      <div>
        <dt class="text-soft text-[10px] uppercase tracking-wider">
          {{ t('ticker.highLow') }}
        </dt>
        <dd class="text-mono mt-0.5 truncate">
          {{ quote.high.toFixed(2) }} · {{ quote.low.toFixed(2) }}
        </dd>
      </div>
      <div class="text-right">
        <dt class="text-soft text-[10px] uppercase tracking-wider">{{ t('ticker.vol') }}</dt>
        <dd class="text-mono mt-0.5">{{ formatCompact(quote.volume) }}</dd>
      </div>
    </dl>

    <!-- Extended-hours sessions (US only, opt-in via settings) -->
    <ul
      v-if="extendedSessions.length"
      class="mt-3 pt-3 border-t border-[var(--tape-border)] space-y-1.5 text-xs"
    >
      <li
        v-for="s in extendedSessions"
        :key="s.kind"
        class="flex-between gap-2"
      >
        <span class="flex items-center gap-1.5 text-soft">
          <component :is="SESSION_ICON[s.kind]" class="size-3" />
          <span class="text-[10px] uppercase tracking-wider">
            {{ sessionLabel(s.kind) }}
          </span>
        </span>
        <span class="flex items-center gap-2 text-mono">
          <span>{{ s.price.toFixed(2) }}</span>
          <span
            :class="
              s.change > 0
                ? 'text-[var(--tape-up)]'
                : s.change < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatChange(s.change) }} ({{ formatPercent(s.changePct) }})
          </span>
        </span>
      </li>
    </ul>
  </article>
</template>
