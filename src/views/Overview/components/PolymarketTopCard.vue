<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconExternalLink from '~icons/lucide/external-link'
import IconCoins from '~icons/lucide/coins'
import IconCalendar from '~icons/lucide/calendar'
import { usePolymarketStore } from '@/stores/polymarket'
import type {
  PolymarketEvent,
  PolymarketMarket,
} from '@/types/polymarket'
import { formatRelative } from '@/utils/format'

/**
 * Polymarket "what is the crowd betting on right now" widget.
 *
 * Two render modes per event, decided per-event by `viewFor()`:
 *
 * 1. **Binary** -single yes/no market. Split bar: Yes share fills from
 *    the left in green, No from the right in red. The bigger side reads
 *    as the consensus call.
 *
 * 2. **Grouped** -multi-candidate races (US president, MVP, Oscars).
 *    Each sub-market is yes/no for one candidate, so we rank by
 *    Yes-probability and show top 3 + "N more" cue.
 */

const { t } = useI18n()
const store = usePolymarketStore()
const { data, loading, error, fetchedAt } = storeToRefs(store)

onMounted(() => void store.load(false))

interface Candidate {
  label: string
  prob: number
}

interface BinaryView {
  kind: 'binary'
  yes: number | null
  no: number | null
}

interface GroupedView {
  kind: 'grouped'
  candidates: Candidate[]
  /** Total markets in the event -for "+N more" cue when truncating. */
  total: number
}

interface NoView {
  kind: 'none'
}

type EventView = BinaryView | GroupedView | NoView

/** Yes-probability for a market -the price of the outcome literally
 *  labeled "Yes", or the first outcome as a fallback. */
function yesProb(m: PolymarketMarket): number | null {
  if (!m.outcomes?.length) return null
  const yes =
    m.outcomes.find((o) => o.label?.toLowerCase() === 'yes') ?? m.outcomes[0]
  return yes?.price ?? null
}

function noProb(m: PolymarketMarket): number | null {
  if (!m.outcomes?.length) return null
  const no = m.outcomes.find((o) => o.label?.toLowerCase() === 'no')
  if (no) return no.price
  // Implied if there's exactly one Yes and no explicit No.
  const yes = yesProb(m)
  return yes != null ? Math.max(0, 1 - yes) : null
}

function viewFor(ev: PolymarketEvent): EventView {
  const ms = ev.markets ?? []
  if (ms.length === 0) return { kind: 'none' }

  // Heuristic: if every market carries a groupItemTitle and there's more
  // than one, treat as a grouped event. Otherwise render the dominant
  // market as binary.
  const allGrouped = ms.every((m) => Boolean(m.groupItemTitle))
  if (ms.length > 1 && allGrouped) {
    const candidates: Candidate[] = ms
      .map((m) => ({
        label: m.groupItemTitle || m.question,
        prob: yesProb(m) ?? 0,
      }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 3)
    return { kind: 'grouped', candidates, total: ms.length }
  }

  // Pick the highest-volume market as the public face of the event.
  const main = [...ms].sort(
    (a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0),
  )[0]
  if (!main) return { kind: 'none' }
  return {
    kind: 'binary',
    yes: yesProb(main),
    no: noProb(main),
  }
}

interface EventRow {
  ev: PolymarketEvent
  view: EventView
}

/** Pre-resolve the view per event so the template stays readable and
 *  v-if branches can refer to the typed variant directly. */
const rows = computed<EventRow[]>(() =>
  (data.value?.events ?? []).map((ev) => ({ ev, view: viewFor(ev) })),
)

function eventUrl(ev: PolymarketEvent): string {
  return `https://polymarket.com/event/${encodeURIComponent(ev.slug || '')}`
}

function formatVolume(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '--'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function formatProbPct(p: number | null): string {
  if (p == null) return '--'
  const pct = p * 100
  if (pct < 1) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

function clampPct(p: number | null): number {
  if (p == null) return 0
  return Math.max(0, Math.min(100, p * 100))
}

function formatEndDate(iso: string | null): string {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  const now = Date.now()
  const days = Math.round((d.getTime() - now) / 86_400_000)
  if (days < 0) return t('overview.polymarket.ended')
  if (days === 0) return t('overview.polymarket.today')
  if (days === 1) return t('overview.polymarket.tomorrow')
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.round(days / 7)}w`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${Math.round(days / 365)}y`
}

function onImgError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

const cachedLabel = computed(() =>
  fetchedAt.value
    ? formatRelative(new Date(fetchedAt.value).toISOString())
    : null,
)
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-5">
    <!-- Header -->
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconCoins class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">{{ t('overview.polymarket.title') }}</h3>
        <span class="text-[10px] text-soft tracking-[0.18em] uppercase">
          {{ t('overview.polymarket.source') }}
        </span>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted">
        <span v-if="cachedLabel" class="text-[11px] text-soft hidden sm:block">
          {{ t('overview.polymarket.cached', { time: cachedLabel }) }}
        </span>
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noopener"
          class="btn-ghost h-8 px-3 text-xs"
          :title="t('overview.polymarket.openTip')"
        >
          <IconExternalLink class="size-3.5" />
          {{ t('overview.polymarket.open') }}
        </a>
        <button
          class="btn-ghost h-8 px-3 text-xs"
          :disabled="loading"
          :title="t('overview.polymarket.refreshTip')"
          @click="store.load(true)"
        >
          <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
          {{ t('overview.polymarket.refresh') }}
        </button>
      </div>
    </header>

    <!-- Error -->
    <div
      v-if="error && !data"
      class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="flex-1 text-[var(--tape-down)] min-w-0 truncate">{{ error }}</div>
      <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="store.load(true)">
        {{ t('overview.polymarket.retry') }}
      </button>
    </div>

    <!-- Loading skeletons -->
    <div v-if="!data && loading" class="space-y-2">
      <div v-for="n in 5" :key="n" class="h-16 skeleton rounded-xl" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="data && rows.length === 0"
      class="text-center py-10 text-sm text-soft"
    >
      {{ t('overview.polymarket.noEvents') }}
    </div>

    <!-- Event list -->
    <ul v-if="rows.length" class="space-y-2">
      <li v-for="(row, i) in rows" :key="row.ev.id">
        <a
          :href="eventUrl(row.ev)"
          target="_blank"
          rel="noopener"
          class="block rounded-xl border border-[var(--tape-border)] hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-surface-hover-bg)] transition-colors p-3.5 group"
        >
          <div class="flex gap-3 items-start">
            <!-- Rank -->
            <span
              class="text-mono text-[11px] font-semibold tabular-nums text-soft mt-0.5 w-5 text-right shrink-0"
            >
              {{ i + 1 }}
            </span>

            <!-- Thumbnail -->
            <img
              v-if="row.ev.image"
              :src="row.ev.image"
              :alt="row.ev.title"
              loading="lazy"
              class="size-10 rounded-lg object-cover bg-[var(--tape-surface-hover-bg)] shrink-0"
              @error="onImgError"
            />
            <div
              v-else
              class="size-10 rounded-lg bg-[var(--tape-surface-hover-bg)] flex-center text-soft shrink-0"
            >
              <IconCoins class="size-4" />
            </div>

            <!-- Body -->
            <div class="flex-1 min-w-0 space-y-2">
              <!-- Title + meta -->
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div
                    class="text-sm font-semibold tracking-tight leading-snug"
                    style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden"
                  >
                    {{ row.ev.title }}
                  </div>
                  <div class="flex items-center gap-2 text-[10px] text-soft uppercase tracking-wider mt-1 flex-wrap">
                    <span v-if="row.ev.category">{{ row.ev.category }}</span>
                    <span v-if="row.ev.category" class="text-soft">·</span>
                    <span class="inline-flex items-center gap-0.5">
                      <IconCoins class="size-2.5" /> {{ formatVolume(row.ev.volume24hr) }}
                    </span>
                    <span class="text-soft">·</span>
                    <span class="inline-flex items-center gap-0.5">
                      <IconCalendar class="size-2.5" /> {{ formatEndDate(row.ev.endDate) }}
                    </span>
                  </div>
                </div>
                <IconExternalLink
                  class="size-3.5 text-soft opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                />
              </div>

              <!-- Binary outcome bar -->
              <div v-if="row.view.kind === 'binary'" class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px] text-mono tabular-nums">
                  <span
                    :class="
                      (row.view.yes ?? 0) >= (row.view.no ?? 0)
                        ? 'text-[var(--tape-up)] font-semibold'
                        : 'text-soft'
                    "
                  >
                    <span class="uppercase tracking-wider text-[9px] mr-1">{{ t('overview.polymarket.yes') }}</span>
                    {{ formatProbPct(row.view.yes) }}
                  </span>
                  <span
                    :class="
                      (row.view.no ?? 0) > (row.view.yes ?? 0)
                        ? 'text-[var(--tape-down)] font-semibold'
                        : 'text-soft'
                    "
                  >
                    {{ formatProbPct(row.view.no) }}
                    <span class="uppercase tracking-wider text-[9px] ml-1">{{ t('overview.polymarket.no') }}</span>
                  </span>
                </div>
                <div class="relative h-1.5 rounded-full bg-[var(--tape-down-soft)] overflow-hidden">
                  <div
                    class="absolute inset-y-0 left-0 bg-[var(--tape-up)] transition-all duration-500"
                    :style="{ width: clampPct(row.view.yes) + '%' }"
                  />
                </div>
              </div>

              <!-- Grouped candidates list -->
              <div v-else-if="row.view.kind === 'grouped'" class="space-y-1.5">
                <div
                  v-for="(c, ci) in row.view.candidates"
                  :key="c.label"
                  class="flex items-center gap-2"
                >
                  <span
                    class="text-xs font-medium truncate min-w-0 flex-1"
                    :class="
                      ci === 0 && c.prob >= 0.5
                        ? 'text-[var(--tape-up)]'
                        : ci === 0
                        ? 'text-[var(--tape-text)]'
                        : 'text-soft'
                    "
                  >
                    {{ c.label }}
                  </span>
                  <div
                    class="relative h-1 rounded-full bg-[var(--tape-surface-hover-bg)] flex-1 max-w-32 overflow-hidden"
                  >
                    <div
                      class="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      :class="ci === 0 ? 'bg-[var(--tape-accent)]' : 'bg-[var(--tape-text-soft)]'"
                      :style="{ width: Math.max(0, Math.min(100, c.prob * 100)) + '%' }"
                    />
                  </div>
                  <span
                    class="text-[11px] text-mono tabular-nums tracking-tight w-12 text-right shrink-0"
                    :class="
                      ci === 0 && c.prob >= 0.5
                        ? 'text-[var(--tape-up)] font-semibold'
                        : ci === 0
                        ? 'text-[var(--tape-text)]'
                        : 'text-soft'
                    "
                  >
                    {{ formatProbPct(c.prob) }}
                  </span>
                </div>
                <div
                  v-if="row.view.total > row.view.candidates.length"
                  class="text-[10px] text-soft tracking-wider uppercase pt-1"
                >
                  {{ t('overview.polymarket.more', { count: row.view.total - row.view.candidates.length }) }}
                </div>
              </div>

              <p v-else class="text-[11px] text-soft">{{ t('overview.polymarket.noMarkets') }}</p>
            </div>
          </div>
        </a>
      </li>
    </ul>
  </article>
</template>
