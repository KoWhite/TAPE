<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconActivity from '~icons/lucide/activity'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconArrowDown from '~icons/lucide/arrow-down'
import IconMinus from '~icons/lucide/minus'
import { useFearGreedStore } from '@/stores/fearGreed'
import { formatRelative } from '@/utils/format'

/**
 * CNN Fear & Greed Index card.
 *
 * The hero is a half-dial gauge with the score INSIDE the arc -biggest
 * possible affordance for "where are we right now". Five labeled zones
 * sit under the arc (Extreme Fear -Extreme Greed) so the rating is legible
 * without reading any numbers.
 *
 * The card itself takes a subtle ambient tint matching the active zone,
 * so a quick peripheral glance already reads "red" or "green" before the
 * eye lands on the dial.
 */

const { t } = useI18n()
const store = useFearGreedStore()
const { data, loading, error, fetchedAt } = storeToRefs(store)

onMounted(() => void store.load(false))

type ZoneId = 'extremeFear' | 'fear' | 'neutral' | 'greed' | 'extremeGreed'

interface ZoneDef {
  /** Inclusive lower bound 0-00. */
  min: number
  /** Exclusive upper bound 0-00 (top zone uses 101). */
  max: number
  /** i18n key suffix under overview.fearGreed.zones.* */
  id: ZoneId
  /** CSS color for arc segments, needle, and accent tint. */
  color: string
}

/** CNN's published rating bands. We mirror them so the colors match
 *  what users see on cnn.com when they cross-reference. */
const ZONES: ZoneDef[] = [
  { min: 0,  max: 25,  id: 'extremeFear',  color: 'var(--tape-down)' },
  { min: 25, max: 45,  id: 'fear',         color: '#f97316' },
  { min: 45, max: 55,  id: 'neutral',      color: 'var(--tape-text-soft)' },
  { min: 55, max: 75,  id: 'greed',        color: '#84cc16' },
  { min: 75, max: 101, id: 'extremeGreed', color: 'var(--tape-up)' },
]

/** Localized zone label resolved from the zone id. */
function zoneLabel(id: ZoneId): string {
  return t(`overview.fearGreed.zones.${id}`)
}

function zoneFor(score: number | null): ZoneDef {
  if (score == null) return ZONES[2]
  for (const z of ZONES) {
    if (score >= z.min && score < z.max) return z
  }
  return ZONES[ZONES.length - 1]
}

const score = computed<number | null>(() => data.value?.score ?? null)
const rating = computed<string | null>(() => data.value?.rating ?? null)
const activeZone = computed(() => zoneFor(score.value))
const accent = computed(() => activeZone.value.color)

/** Half-circle dial geometry. The needle angle linearly maps 0-00 onto
 *  -0° -+90°, so 50 sits straight up. */
const needleDeg = computed(() => {
  const s = score.value
  if (s == null) return 0
  const clamped = Math.max(0, Math.min(100, s))
  return -90 + (clamped / 100) * 180
})

// ── Arc geometry ───────────────────────────────────────────────────────
// Single source of truth -every visual that traces the arc reuses these.
const ARC_CX = 150
const ARC_CY = 150
const ARC_R = 120
/** Map a 0-00 score to (x, y) on the half-circle path. Score 0 sits at
 *  the left extreme (angle π), 50 at the top (angle π/2), 100 at the right
 *  (angle 0). SVG y is flipped, hence the subtraction on the y term. */
function arcPoint(score: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(100, score)) / 100
  const angle = Math.PI * (1 - t)
  return {
    x: ARC_CX + ARC_R * Math.cos(angle),
    y: ARC_CY - ARC_R * Math.sin(angle),
  }
}
function arcPathBetween(from: number, to: number): string {
  const a = arcPoint(from)
  const b = arcPoint(to)
  const largeArc = 0
  const sweep = 1
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${ARC_R} ${ARC_R} 0 ${largeArc} ${sweep} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

/** SVG path data for each zone segment. Pre-computed so the template stays clean. */
const zoneSegments = computed(() =>
  ZONES.map((z) => {
    const upper = z.max === 101 ? 100 : z.max
    return {
      ...z,
      // Insert tiny gap between segments for visual separation.
      path: arcPathBetween(z.min + (z.min === 0 ? 0 : 0.6), upper - (upper === 100 ? 0 : 0.6)),
      labelPos: arcPoint((z.min + upper) / 2),
    }
  }),
)

// ── History snapshots ─────────────────────────────────────────────────
interface Snapshot {
  label: string
  value: number | null
  delta: number | null
}

const snapshots = computed<Snapshot[]>(() => {
  const cur = score.value
  const h = data.value?.history
  if (!h) return []
  const mk = (label: string, v: number | null): Snapshot => ({
    label,
    value: v,
    delta: cur != null && v != null ? cur - v : null,
  })
  return [
    mk(t('overview.fearGreed.prevClose'), h.previousClose),
    mk(t('overview.fearGreed.oneWeek'), h.oneWeek),
    mk(t('overview.fearGreed.oneMonth'), h.oneMonth),
    mk(t('overview.fearGreed.oneYear'), h.oneYear),
  ]
})

// ── Sparkline ──────────────────────────────────────────────────────────
const SPARK_W = 600
const SPARK_H = 70

interface SparkPath {
  line: string
  area: string
}

const sparklineData = computed<{
  path: SparkPath
  values: number[]
} | null>(() => {
  const pts = (data.value?.sparkline ?? [])
    .map((p) => p.value)
    .filter((v): v is number => typeof v === 'number')
  if (pts.length < 2) return null

  // Always render against a fixed 0-00 y-range -the index lives on this
  // scale and the absolute position carries meaning. Min/max scaling would
  // hide the fact that, say, 60 has been the floor for a year.
  const stepX = SPARK_W / (pts.length - 1)
  const coords = pts.map((p, i) => {
    const x = i * stepX
    const y = SPARK_H - (p / 100) * SPARK_H
    return [x, y] as const
  })
  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ')
  const area = `${line} L${SPARK_W.toFixed(2)},${SPARK_H} L0,${SPARK_H} Z`

  return { path: { line, area }, values: pts }
})

// ── Misc ──────────────────────────────────────────────────────────────
const updatedLabel = computed(() => {
  const ts = data.value?.updatedAt
  return ts ? formatRelative(ts) : '--'
})

const cachedLabel = computed(() => {
  return fetchedAt.value
    ? formatRelative(new Date(fetchedAt.value).toISOString())
    : null
})

function formatDelta(delta: number | null): string {
  if (delta == null) return '--'
  const r = Math.round(delta)
  if (r === 0) return '±0'
  return r > 0 ? `+${r}` : `${r}`
}

function deltaIcon(delta: number | null) {
  if (delta == null || Math.abs(delta) < 0.5) return IconMinus
  return delta > 0 ? IconArrowUp : IconArrowDown
}

function deltaTone(delta: number | null): string {
  if (delta == null) return 'text-soft'
  if (delta > 0.5) return 'text-[var(--tape-up)]'
  if (delta < -0.5) return 'text-[var(--tape-down)]'
  return 'text-soft'
}
</script>

<template>
  <article
    class="relative overflow-hidden surface p-5 sm:p-6 space-y-6 transition-colors duration-700"
    :style="{ '--zone-accent': accent }"
  >
    <!-- Ambient zone tint -radial glow from top-center matches the active zone. -->
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.07] transition-opacity duration-700"
      :style="{
        background: `radial-gradient(80% 80% at 50% 0%, ${accent} 0%, transparent 70%)`,
      }"
    />

    <!-- Header -->
    <header class="relative flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconActivity class="size-4" :style="{ color: accent }" />
        <h3 class="font-semibold tracking-tight">{{ t('overview.fearGreed.title') }}</h3>
        <span class="text-[10px] text-soft tracking-[0.18em] uppercase">CNN</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-muted">
        <span v-if="data" class="text-[11px] text-soft hidden sm:block">
          {{ t('overview.fearGreed.updated', { time: updatedLabel }) }}
          <span v-if="cachedLabel" class="ml-1">· {{ t('overview.fearGreed.cached', { time: cachedLabel }) }}</span>
        </span>
        <button
          class="btn-ghost h-8 px-3 text-xs"
          :disabled="loading"
          :title="t('overview.fearGreed.refreshTip')"
          @click="store.load(true)"
        >
          <IconRefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
          {{ t('overview.fearGreed.refresh') }}
        </button>
      </div>
    </header>

    <!-- Error / loading -->
    <div
      v-if="error && !data"
      class="relative surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="flex-1 text-[var(--tape-down)] min-w-0 truncate">{{ error }}</div>
      <button class="btn-ghost h-7 px-2 text-xs shrink-0" @click="store.load(true)">
        {{ t('overview.fearGreed.retry') }}
      </button>
    </div>

    <div v-if="!data && loading" class="relative h-72 skeleton rounded-xl" />

    <!-- Hero gauge -->
    <div v-if="data" class="relative">
      <div class="mx-auto max-w-md">
        <svg
          viewBox="0 0 300 175"
          class="w-full h-auto block overflow-visible"
          aria-label="Fear and Greed gauge"
        >
          <!-- Background track -->
          <path
            :d="arcPathBetween(0, 100)"
            stroke="var(--tape-border)"
            stroke-width="22"
            stroke-linecap="round"
            fill="none"
            opacity="0.45"
          />

          <!-- Five colored zone segments -active zone fully opaque -->
          <path
            v-for="z in zoneSegments"
            :key="z.id"
            :d="z.path"
            :stroke="z.color"
            stroke-width="20"
            stroke-linecap="round"
            fill="none"
            :opacity="z.id === activeZone.id ? 1 : 0.32"
            class="transition-opacity duration-500"
          />

          <!-- Tick numbers along the outside of the arc -->
          <g
            font-size="9"
            font-family="JetBrains Mono, ui-monospace, monospace"
            fill="var(--tape-text-soft)"
            text-anchor="middle"
          >
            <text :x="arcPoint(0).x - 6" :y="arcPoint(0).y + 16">0</text>
            <text :x="arcPoint(25).x - 8" :y="arcPoint(25).y - 8">25</text>
            <text :x="arcPoint(50).x" :y="arcPoint(50).y - 16">50</text>
            <text :x="arcPoint(75).x + 8" :y="arcPoint(75).y - 8">75</text>
            <text :x="arcPoint(100).x + 6" :y="arcPoint(100).y + 16">100</text>
          </g>

          <!-- Needle. Two nested groups so the rotation pivot is established
               by an outer translate to the dial center; the inner group does
               a pure rotate around (0,0). This avoids the SVG-attribute
               `rotate(a cx cy)` form, which conflicts with CSS transitions
               and shoves the needle off-axis. -->
          <g :transform="`translate(${ARC_CX} ${ARC_CY})`">
            <g
              :transform="`rotate(${needleDeg})`"
              style="transition: transform 900ms cubic-bezier(.16,1,.3,1)"
            >
              <!-- Glow halo -->
              <circle cx="0" cy="0" r="20" :fill="accent" opacity="0.18" />
              <!-- Needle shaft, drawn from just below pivot to near arc inner edge -->
              <line
                x1="0"
                y1="4"
                x2="0"
                :y2="-(ARC_R - 18)"
                :stroke="accent"
                stroke-width="3"
                stroke-linecap="round"
              />
              <circle cx="0" cy="0" r="11" :fill="accent" />
              <circle cx="0" cy="0" r="4" fill="var(--tape-bg-elev)" />
            </g>
          </g>
        </svg>

        <!-- Score + rating directly below the dial -->
        <div class="text-center -mt-2 sm:-mt-4 space-y-1">
          <div
            class="text-mono font-semibold tabular-nums tracking-tight leading-none"
            style="font-size: clamp(60px, 14vw, 96px)"
            :style="{ color: accent }"
          >
            {{ score != null ? Math.round(score) : '--' }}
          </div>
          <div
            v-if="rating"
            class="text-xs sm:text-sm font-semibold uppercase"
            style="letter-spacing: 0.32em"
            :style="{ color: accent }"
          >
            {{ rating }}
          </div>
        </div>

        <!-- Zone strip -labeled bands that align under the dial -->
        <div class="grid grid-cols-5 gap-px mt-5">
          <div
            v-for="z in ZONES"
            :key="z.id"
            class="text-center py-2 text-[9px] font-semibold tracking-[0.12em] uppercase transition-all duration-500"
            :class="z.id === activeZone.id ? 'opacity-100' : 'opacity-30'"
            :style="{
              color: z.color,
              borderTop: `2px solid ${z.color}`,
            }"
          >
            {{ zoneLabel(z.id) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Sparkline + history snapshots -->
    <section v-if="data" class="relative space-y-4">
      <div class="flex-between">
        <span class="text-[10px] uppercase tracking-[0.18em] text-soft">
          {{ t('overview.fearGreed.trajectory') }}
        </span>
        <span v-if="sparklineData" class="text-[10px] text-soft text-mono">
          {{ t('overview.fearGreed.range', { min: Math.round(Math.min(...sparklineData.values)), max: Math.round(Math.max(...sparklineData.values)) }) }}
        </span>
      </div>

      <div v-if="sparklineData" class="relative">
        <svg
          :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
          preserveAspectRatio="none"
          class="w-full h-16 block overflow-visible"
        >
          <!-- 50-line reference (neutral mid) -->
          <line
            x1="0"
            :y1="SPARK_H / 2"
            :x2="SPARK_W"
            :y2="SPARK_H / 2"
            stroke="var(--tape-border)"
            stroke-width="1"
            stroke-dasharray="3 3"
          />
          <!-- Area fill -->
          <path
            :d="sparklineData.path.area"
            :fill="accent"
            opacity="0.12"
          />
          <!-- Line -->
          <path
            :d="sparklineData.path.line"
            fill="none"
            :stroke="accent"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <!-- Historical snapshots -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          v-for="s in snapshots"
          :key="s.label"
          class="rounded-xl border border-[var(--tape-border)] px-3 py-2.5 transition-colors hover:border-[var(--tape-border-hover)]"
        >
          <div class="text-[10px] uppercase tracking-wider text-soft">
            {{ s.label }}
          </div>
          <div class="flex items-baseline justify-between gap-2 mt-1">
            <span class="text-mono text-xl font-semibold tabular-nums">
              {{ s.value != null ? Math.round(s.value) : '--' }}
            </span>
            <span
              v-if="s.delta != null"
              class="text-[11px] text-mono tabular-nums inline-flex items-center gap-0.5"
              :class="deltaTone(s.delta)"
            >
              <component :is="deltaIcon(s.delta)" class="size-2.5" />
              {{ formatDelta(s.delta) }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Indicators grid -->
    <section
      v-if="data?.indicators?.length"
      class="relative pt-5 border-t border-[var(--tape-border)] space-y-3"
    >
      <div class="flex-between">
        <h4 class="text-[10px] uppercase tracking-[0.18em] text-soft font-semibold">
          {{ t('overview.fearGreed.indicatorsTitle') }}
        </h4>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <article
          v-for="ind in data.indicators"
          :key="ind.id"
          class="rounded-xl border border-[var(--tape-border)] p-3.5 hover:border-[var(--tape-border-hover)] transition-colors space-y-2"
        >
          <div class="flex-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-xs font-semibold tracking-tight truncate">
                {{ ind.label }}
              </div>
              <div class="text-[10px] text-soft truncate mt-0.5">
                {{ ind.description }}
              </div>
            </div>
            <span
              class="text-mono text-xl font-semibold tabular-nums shrink-0"
              :style="{ color: zoneFor(ind.score).color }"
            >
              {{ ind.score != null ? Math.round(ind.score) : '--' }}
            </span>
          </div>

          <!-- Mini bar with needle marker -->
          <div class="relative h-1 rounded-full bg-[var(--tape-border)] overflow-hidden">
            <div
              class="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              :style="{
                width: (ind.score != null ? Math.max(2, Math.min(100, ind.score)) : 0) + '%',
                backgroundColor: zoneFor(ind.score).color,
              }"
            />
          </div>

          <div class="flex items-center justify-between">
            <span
              v-if="ind.rating"
              class="text-[9px] uppercase tracking-[0.15em] font-semibold"
              :style="{ color: zoneFor(ind.score).color }"
            >
              {{ ind.rating }}
            </span>
            <span v-else class="text-[9px] text-soft">--</span>
            <span class="text-[9px] text-soft text-mono tabular-nums">
              {{ zoneLabel(zoneFor(ind.score).id) }}
            </span>
          </div>
        </article>
      </div>
    </section>
  </article>
</template>
