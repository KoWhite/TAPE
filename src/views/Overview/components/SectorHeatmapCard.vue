<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import IconLayoutGrid from '~icons/lucide/layout-grid'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconMinus from '~icons/lucide/minus'
import { useMarketSectorsStore } from '@/stores/marketSectors'
import type { SectorEtf } from '@/types/marketSector'
import { formatPercent, formatRelative } from '@/utils/format'

/**
 * Board-level US sector heatmap. Eleven SPDR Select Sector ETFs serve as
 * canonical proxies for each GICS sector -what Wall Street uses to say
 * "how is utilities doing today" without having to roll up 30+ stocks.
 *
 * Visual model:
 *  - Header carries a *breadth strip* (gainers vs losers) so the macro
 *    read is settled before the eye even hits the grid.
 *  - Each tile leads with the percentage at large weight; the sector
 *    name is the title, ETF symbol is meta.
 *  - A day-range bar at the bottom of every tile shows where price sits
 *    inside today's high/low -turns "how strong is this rally" into a
 *    one-glance read.
 */

const { t } = useI18n()
const router = useRouter()
const store = useMarketSectorsStore()
const { data, loading, error, fetchedAt } = storeToRefs(store)

let timer: number | null = null

onMounted(() => {
  void store.load(false)
  timer = window.setInterval(() => void store.load(false), 60_000)
})

onBeforeUnmount(() => {
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
})

const sectors = computed<SectorEtf[]>(() => data.value?.sectors ?? [])

/** Sort by today's change desc -leader to laggard, top-left -bottom-right. */
const sorted = computed<SectorEtf[]>(() =>
  [...sectors.value].sort((a, b) => b.changePct - a.changePct),
)

interface Breadth {
  up: number
  down: number
  flat: number
  total: number
  /** Equal-weight average change across all sectors -a quick "macro
   *  pulse" indicator that ignores market-cap weighting. */
  avgChange: number
  best: SectorEtf | null
  worst: SectorEtf | null
}

const FLAT_EPS = 0.001  // ±0.1% counts as flat for breadth bucketing

const breadth = computed<Breadth>(() => {
  let up = 0
  let down = 0
  let flat = 0
  let sum = 0
  let best: SectorEtf | null = null
  let worst: SectorEtf | null = null
  for (const s of sectors.value) {
    sum += s.changePct
    if (s.changePct > FLAT_EPS) up++
    else if (s.changePct < -FLAT_EPS) down++
    else flat++
    if (best === null || s.changePct > best.changePct) best = s
    if (worst === null || s.changePct < worst.changePct) worst = s
  }
  const total = sectors.value.length
  return {
    up,
    down,
    flat,
    total,
    avgChange: total ? sum / total : 0,
    best,
    worst,
  }
})

interface ToneStyle {
  /** Tile background -soft gradient that gives depth without shouting. */
  background: string
  /** Tile border -solid color tinted by direction + magnitude. */
  borderColor: string
  /** Top accent bar -full-saturation marker of direction. */
  accent: string
}

/**
 * Map a daily return to the full visual styling for one tile. Magnitude
 * is capped at ±2.5% -sector ETFs rarely move more than that in a day,
 * so capping keeps the gradient legible across normal regimes while a
 * truly extreme move (rare) just plateaus at peak intensity.
 */
function toneFor(ret: number): ToneStyle {
  const mag = Math.min(1, Math.abs(ret) / 0.025)
  const baseAlpha = 0.10 + mag * 0.22       // 0.10 -0.32
  const peakAlpha = 0.18 + mag * 0.32       // 0.18 -0.50
  const borderAlpha = 0.30 + mag * 0.45     // 0.30 -0.75

  // Bloomberg-style green/red, neutral-gray for flat.
  const rgb =
    ret > FLAT_EPS
      ? '34, 197, 94'
      : ret < -FLAT_EPS
      ? '239, 68, 68'
      : '107, 114, 128'

  return {
    background: `linear-gradient(135deg, rgba(${rgb}, ${peakAlpha}) 0%, rgba(${rgb}, ${baseAlpha}) 100%)`,
    borderColor: `rgba(${rgb}, ${borderAlpha})`,
    accent: `rgb(${rgb})`,
  }
}

function toneClass(ret: number): string {
  if (ret > FLAT_EPS) return 'text-[var(--tape-up)]'
  if (ret < -FLAT_EPS) return 'text-[var(--tape-down)]'
  return 'text-soft'
}

function dirIcon(ret: number) {
  if (ret > FLAT_EPS) return IconTrendingUp
  if (ret < -FLAT_EPS) return IconTrendingDown
  return IconMinus
}

/** Map last -0-00% position within the day's range; clamped so a
 *  weird tick outside [low, high] still snaps to the bar edges. */
function rangePos(s: SectorEtf): number {
  if (!s.dayHigh || !s.dayLow || s.dayHigh <= s.dayLow) return 50
  const pct = ((s.last - s.dayLow) / (s.dayHigh - s.dayLow)) * 100
  return Math.max(0, Math.min(100, pct))
}

const cachedLabel = computed(() =>
  fetchedAt.value
    ? formatRelative(new Date(fetchedAt.value).toISOString())
    : null,
)

function openEtf(symbol: string): void {
  router.push(`/stock/${encodeURIComponent('US.' + symbol)}`)
}
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-5">
    <!-- Header -->
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconLayoutGrid class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">{{ t('overview.sectorHeatmap.title') }}</h3>
        <span class="text-[10px] text-soft tracking-[0.18em] uppercase">
          {{ t('overview.sectorHeatmap.source') }}
        </span>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted">
        <span v-if="cachedLabel" class="text-[11px] text-soft hidden sm:block">
          {{ t('overview.sectorHeatmap.synced', { time: cachedLabel }) }}
        </span>
        <button
          class="btn-ghost h-8 px-3 text-xs"
          :disabled="loading"
          :title="t('overview.sectorHeatmap.refreshTip')"
          @click="store.load(true)"
        >
          <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
          {{ t('overview.sectorHeatmap.refresh') }}
        </button>
      </div>
    </header>

    <!-- Breadth strip -collective sector pulse at a glance -->
    <section v-if="breadth.total > 0 && sorted.length" class="space-y-2.5">
      <div class="flex items-center justify-between gap-3 flex-wrap text-[11px]">
        <div class="flex items-center gap-3 text-mono tabular-nums">
          <span class="inline-flex items-center gap-1">
            <span class="size-1.5 rounded-full bg-[var(--tape-up)]" />
            <span class="text-[var(--tape-up)] font-semibold">{{ breadth.up }}</span>
            <span class="text-soft uppercase tracking-wider text-[9px]">{{ t('overview.sectorHeatmap.up') }}</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="size-1.5 rounded-full bg-[var(--tape-text-soft)] opacity-50" />
            <span class="text-soft font-semibold">{{ breadth.flat }}</span>
            <span class="text-soft uppercase tracking-wider text-[9px]">{{ t('overview.sectorHeatmap.flat') }}</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <span class="size-1.5 rounded-full bg-[var(--tape-down)]" />
            <span class="text-[var(--tape-down)] font-semibold">{{ breadth.down }}</span>
            <span class="text-soft uppercase tracking-wider text-[9px]">{{ t('overview.sectorHeatmap.down') }}</span>
          </span>
        </div>
        <div class="flex items-center gap-2 text-[10px] text-soft uppercase tracking-wider">
          <span>{{ t('overview.sectorHeatmap.avg') }}</span>
          <span
            class="text-mono text-xs tabular-nums font-semibold normal-case"
            :class="toneClass(breadth.avgChange)"
          >
            {{ formatPercent(breadth.avgChange) }}
          </span>
        </div>
      </div>

      <!-- Visual breadth bar -width-proportional gainers / flat / losers -->
      <div class="flex h-1.5 rounded-full overflow-hidden bg-[var(--tape-surface-hover-bg)]">
        <div
          v-if="breadth.up"
          class="bg-[var(--tape-up)] transition-all duration-500"
          :style="{ width: (breadth.up / breadth.total * 100) + '%' }"
          :title="t('overview.sectorHeatmap.sectorsUp', { count: breadth.up })"
        />
        <div
          v-if="breadth.flat"
          class="bg-[var(--tape-text-soft)] opacity-30 transition-all duration-500"
          :style="{ width: (breadth.flat / breadth.total * 100) + '%' }"
          :title="t('overview.sectorHeatmap.sectorsFlat', { count: breadth.flat })"
        />
        <div
          v-if="breadth.down"
          class="bg-[var(--tape-down)] transition-all duration-500"
          :style="{ width: (breadth.down / breadth.total * 100) + '%' }"
          :title="t('overview.sectorHeatmap.sectorsDown', { count: breadth.down })"
        />
      </div>

      <!-- Best / worst callout -->
      <div
        v-if="breadth.best && breadth.worst && breadth.best.symbol !== breadth.worst.symbol"
        class="flex items-center justify-between gap-3 text-[11px] text-soft pt-0.5"
      >
        <span class="inline-flex items-center gap-1.5 min-w-0">
          <IconTrendingUp class="size-3 text-[var(--tape-up)] shrink-0" />
          <span class="truncate">{{ breadth.best.name }}</span>
          <span
            class="text-mono tabular-nums font-semibold text-[var(--tape-up)] shrink-0"
          >
            {{ formatPercent(breadth.best.changePct) }}
          </span>
        </span>
        <span class="inline-flex items-center gap-1.5 min-w-0">
          <IconTrendingDown class="size-3 text-[var(--tape-down)] shrink-0" />
          <span
            class="text-mono tabular-nums font-semibold text-[var(--tape-down)] shrink-0"
          >
            {{ formatPercent(breadth.worst.changePct) }}
          </span>
          <span class="truncate">{{ breadth.worst.name }}</span>
        </span>
      </div>
    </section>

    <!-- Error -->
    <div
      v-if="error && !sorted.length"
      class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="flex-1 text-[var(--tape-down)] min-w-0 truncate">{{ error }}</div>
      <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="store.load(true)">
        {{ t('overview.sectorHeatmap.retry') }}
      </button>
    </div>

    <!-- Loading skeletons -->
    <div
      v-if="!sorted.length && loading"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      <div v-for="n in 11" :key="n" class="h-32 skeleton rounded-2xl" />
    </div>

    <!-- Tile grid -->
    <div
      v-if="sorted.length"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      <button
        v-for="s in sorted"
        :key="s.symbol"
        class="group relative text-left rounded-2xl border overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer min-h-32"
        :style="{
          background: toneFor(s.changePct).background,
          borderColor: toneFor(s.changePct).borderColor,
        }"
        :title="`${s.name} (${s.symbol}) · last ${s.last.toFixed(2)} · prev ${s.prevClose.toFixed(2)}`"
        @click="openEtf(s.symbol)"
      >
        <!-- Top accent bar -direction marker even on muted tones -->
        <!-- <div
          class="absolute inset-x-0 top-0 h-1 transition-opacity group-hover:opacity-100"
          :style="{ background: toneFor(s.changePct).accent, opacity: 0.85 }"
        /> -->

        <!-- Sector name + ETF symbol -single line, name dominant -->
        <h4 class="text-sm font-semibold tracking-tight truncate mb-3">
          {{ s.name }}
          <span class="text-soft font-normal ml-1">{{ s.symbol }}</span>
        </h4>

        <!-- Hero percentage -->
        <div class="flex items-center gap-1.5">
          <component
            :is="dirIcon(s.changePct)"
            class="size-5 shrink-0"
            :class="toneClass(s.changePct)"
          />
          <span
            class="text-mono text-2xl sm:text-[28px] font-bold tabular-nums tracking-tight leading-none"
            :class="toneClass(s.changePct)"
          >
            {{ formatPercent(s.changePct) }}
          </span>
        </div>

        <!-- Footer: price + absolute change -->
        <div class="flex items-baseline justify-between mt-3 text-[11px]">
          <span class="text-mono tabular-nums text-soft">
            {{ s.last.toFixed(2) }}
          </span>
          <span
            class="text-mono tabular-nums font-medium"
            :class="toneClass(s.change)"
          >
            {{ s.change.toFixed(2) }}
          </span>
        </div>

        <!-- Day range bar -where price sits inside today's high/low.
             Only render when we have meaningful range data. -->
        <div
          v-if="s.dayHigh && s.dayLow && s.dayHigh > s.dayLow"
          class="mt-2.5 relative h-0.5 rounded-full bg-black/10 dark:bg-white/10"
          :title="`Day range ${s.dayLow.toFixed(2)} -${s.dayHigh.toFixed(2)}`"
        >
          <div
            class="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-[var(--tape-bg-elev)] border-2 shadow-sm"
            :style="{
              left: rangePos(s) + '%',
              transform: 'translate(-50%, -50%)',
              borderColor: toneFor(s.changePct).accent,
            }"
          />
        </div>
      </button>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!loading && !error"
      class="text-center py-6 text-sm text-soft"
    >
      {{ t('overview.sectorHeatmap.empty') }}
    </div>
  </article>
</template>
