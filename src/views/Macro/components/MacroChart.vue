<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconMinus from '~icons/lucide/minus'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import type {
  MacroPoint,
  MacroRange,
  MacroSeries,
  MacroSeriesConfig,
} from '@/types/macro'
import { formatRelative } from '@/utils/format'
import {
  clipMacroRange,
  formatMacroAxis,
  formatMacroDelta,
  formatMacroValue,
  transformMacroPoints,
} from '@/utils/macroFormat'
import { ChartSkeleton } from '@/components/ui/chart-skeleton'

const props = defineProps<{
  series: MacroSeries | null
  config: MacroSeriesConfig
  loading?: boolean
  error?: string | null
  fetchedAt?: number | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const range = ref<MacroRange>('5Y')
const RANGES: MacroRange[] = ['1Y', '3Y', '5Y', '10Y', 'ALL']

const transformed = computed<MacroPoint[]>(() => {
  if (!props.series) return []
  return transformMacroPoints(props.series.observations, props.config.transform)
})

const visible = computed<MacroPoint[]>(() =>
  clipMacroRange(transformed.value, range.value),
)

// ──────────────────────────────────────────────────────────────────────
// Headline stat -the latest value and its change vs the prior point.
// ──────────────────────────────────────────────────────────────────────
const latest = computed(() => transformed.value.at(-1) ?? null)
const previous = computed(() => transformed.value.at(-2) ?? null)

const direction = computed<'up' | 'down' | 'flat'>(() => {
  if (!latest.value || !previous.value) return 'flat'
  const d = latest.value.value - previous.value.value
  if (Math.abs(d) < 1e-9) return 'flat'
  return d > 0 ? 'up' : 'down'
})

const isFavorable = computed(() => {
  if (direction.value === 'flat') return null
  const good = props.config.positiveIsGood ?? true
  return (direction.value === 'up') === good
})

const headlineColor = computed(() => {
  if (isFavorable.value === null) return 'text-[var(--tape-text-soft)]'
  return isFavorable.value ? 'text-[var(--tape-up)]' : 'text-[var(--tape-down)]'
})

const lineColor = computed(() => {
  // For "positive is bad" series (CPI/unemployment), invert the trend color.
  if (transformed.value.length < 2) return 'var(--tape-accent)'
  const first = transformed.value[0].value
  const last = transformed.value.at(-1)!.value
  const rising = last >= first
  const good = props.config.positiveIsGood ?? true
  return (rising === good) ? 'var(--tape-up)' : 'var(--tape-down)'
})

// ──────────────────────────────────────────────────────────────────────
// Value formatting — thin wrappers binding this card's config; shared
// implementations live in @/utils/macroFormat.
// ──────────────────────────────────────────────────────────────────────
const formatValue = (v: number): string => formatMacroValue(v, props.config)
const formatDelta = (v: number): string => formatMacroDelta(v, props.config)
const formatAxis = (v: number): string => formatMacroAxis(v, props.config)

const changeFromPrev = computed(() => {
  if (!latest.value || !previous.value) return null
  return latest.value.value - previous.value.value
})

const headlineSign = computed(() => {
  if (direction.value === 'flat') return IconMinus
  return direction.value === 'up' ? IconTrendingUp : IconTrendingDown
})

// ──────────────────────────────────────────────────────────────────────
// Responsive SVG dimensions -track container width via ResizeObserver.
// ──────────────────────────────────────────────────────────────────────
const wrapEl = ref<HTMLDivElement | null>(null)
const width = ref(720)
const HEIGHT = 280
const MARGIN = { top: 14, right: 16, bottom: 28, left: 56 }

let ro: ResizeObserver | null = null
onMounted(() => {
  if (!wrapEl.value) return
  width.value = Math.max(320, wrapEl.value.clientWidth)
  ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width
    if (w) width.value = Math.max(320, Math.floor(w))
  })
  ro.observe(wrapEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

const innerW = computed(() => width.value - MARGIN.left - MARGIN.right)
const innerH = HEIGHT - MARGIN.top - MARGIN.bottom

// ──────────────────────────────────────────────────────────────────────
// Scales + paths
// ──────────────────────────────────────────────────────────────────────
interface Plot {
  scaled: { x: number; y: number; point: MacroPoint }[]
  yMin: number
  yMax: number
  yTicks: number[]
  xTicks: { x: number; label: string }[]
  line: string
  area: string
}

const plot = computed<Plot | null>(() => {
  const pts = visible.value
  if (pts.length < 2) return null

  const t0 = new Date(pts[0].date).getTime()
  const t1 = new Date(pts[pts.length - 1].date).getTime()
  const tSpan = t1 - t0 || 1

  const values = pts.map((p) => p.value)
  let yMin = Math.min(...values)
  let yMax = Math.max(...values)
  // Add a small padding so the line isn't flush against the edges.
  const yPad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.08 || 1
  yMin -= yPad
  yMax += yPad
  // For percent-formatted series, snap min to 0 if all values are positive
  // (e.g. CPI YoY) to give a stable visual baseline.
  if (props.config.format === 'percent_signed' && Math.min(...values) >= 0) {
    yMin = Math.min(0, yMin)
  }
  const ySpan = yMax - yMin || 1

  const xOf = (t: number) =>
    MARGIN.left + ((t - t0) / tSpan) * innerW.value
  const yOf = (v: number) =>
    MARGIN.top + (1 - (v - yMin) / ySpan) * innerH

  const scaled = pts.map((p) => ({
    point: p,
    x: xOf(new Date(p.date).getTime()),
    y: yOf(p.value),
  }))

  const line = scaled
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${s.x.toFixed(2)},${s.y.toFixed(2)}`)
    .join(' ')

  const baseY = MARGIN.top + innerH
  const area = `${line} L${scaled[scaled.length - 1].x.toFixed(2)},${baseY} L${scaled[0].x.toFixed(2)},${baseY} Z`

  // 4 horizontal gridlines / y-tick labels
  const yTicks: number[] = []
  for (let i = 0; i <= 4; i++) yTicks.push(yMin + (ySpan * i) / 4)

  // 5 evenly-spaced x labels
  const xTicks: { x: number; label: string }[] = []
  const labelCount = width.value < 520 ? 3 : 5
  for (let i = 0; i < labelCount; i++) {
    const t = t0 + (tSpan * i) / (labelCount - 1)
    xTicks.push({
      x: xOf(t),
      label: shortDate(new Date(t), range.value),
    })
  }

  return { scaled, yMin, yMax, yTicks, xTicks, line, area }
})

function shortDate(d: Date, r: MacroRange): string {
  const month = d.toLocaleString('en-US', { month: 'short' })
  const year = d.getFullYear()
  if (r === '1Y') return `${month} ${String(d.getFullYear()).slice(2)}`
  return `${month} '${String(year).slice(2)}`
}

// ──────────────────────────────────────────────────────────────────────
// Hover crosshair
// ──────────────────────────────────────────────────────────────────────
const hoverIdx = ref<number | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)

function onMove(e: MouseEvent) {
  const p = plot.value
  if (!p || !svgEl.value) return
  const rect = svgEl.value.getBoundingClientRect()
  const ratio = width.value / rect.width
  const xPx = (e.clientX - rect.left) * ratio

  // Binary search for the nearest scaled.x
  let lo = 0
  let hi = p.scaled.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (p.scaled[mid].x < xPx) lo = mid + 1
    else hi = mid
  }
  // Pick the closer of lo or lo-1
  let idx = lo
  if (lo > 0 && Math.abs(p.scaled[lo - 1].x - xPx) < Math.abs(p.scaled[lo].x - xPx)) {
    idx = lo - 1
  }
  hoverIdx.value = idx
}

function onLeave() {
  hoverIdx.value = null
}

const hoverPoint = computed(() => {
  const p = plot.value
  if (!p || hoverIdx.value === null) return null
  return p.scaled[hoverIdx.value] ?? null
})

const tooltipPos = computed(() => {
  const h = hoverPoint.value
  if (!h) return null
  // Flip horizontally near the right edge so the tooltip stays visible.
  const PAD = 12
  const TOOLTIP_W = 180
  const flip = h.x + TOOLTIP_W + PAD > width.value
  return {
    left: `${(flip ? h.x - TOOLTIP_W - PAD : h.x + PAD).toFixed(0)}px`,
    top: `${Math.max(MARGIN.top, h.y - 28).toFixed(0)}px`,
  }
})

// Re-clamp the hover index when range or data changes.
watch([range, transformed], () => {
  hoverIdx.value = null
})

const lastUpdatedRel = computed(() => {
  if (!props.fetchedAt) return null
  return formatRelative(new Date(props.fetchedAt).toISOString())
})

const fredPubRel = computed(() => {
  const ts = props.series?.lastUpdated
  if (!ts) return null
  // FRED's last_updated is "YYYY-MM-DD HH:MM:SS-05" -Date can parse that.
  const t = new Date(ts.replace(' ', 'T'))
  if (Number.isNaN(t.getTime())) return null
  return formatRelative(t.toISOString())
})

const gradientId = computed(() => `macro-grad-${props.config.id}`)
</script>

<template>
  <article class="surface p-5 sm:p-6 flex flex-col gap-4 relative">
    <!-- Header -->
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight">
            {{ config.label }}
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ config.id }} · {{ series?.frequencyShort || series?.frequency || '--' }}
          </span>
        </div>
        <p v-if="config.description" class="text-xs text-muted mt-0.5">
          {{ config.description }}
        </p>
      </div>
      <button
        class="flex-shrink-0 w-8 h-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        :title="lastUpdatedRel ? `Refresh (cached ${lastUpdatedRel})` : 'Refresh'"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <IconRefreshCw class="size-4" :class="loading && 'animate-spin'" />
      </button>
    </header>

    <!-- Headline value -->
    <div class="flex items-end justify-between gap-4">
      <div class="flex flex-col">
        <span class="text-[10px] uppercase tracking-wider text-soft">
          Latest · {{ latest ? new Date(latest.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '--' }}
        </span>
        <span
          class="text-mono text-3xl sm:text-4xl font-semibold tracking-tight mt-1"
          :class="headlineColor"
        >
          {{ latest ? formatValue(latest.value) : '--' }}
        </span>
      </div>
      <div v-if="changeFromPrev !== null" class="flex flex-col items-end gap-1.5">
        <span class="text-[10px] uppercase tracking-wider text-soft">
          vs prev
        </span>
        <span
          class="pill"
          :class="
            isFavorable === null
              ? 'pill-flat'
              : isFavorable
              ? 'pill-up'
              : 'pill-down'
          "
        >
          <component :is="headlineSign" class="size-3" />
          {{ formatDelta(changeFromPrev) }}
        </span>
      </div>
    </div>

    <!-- Chart canvas -->
    <div ref="wrapEl" class="relative w-full" :style="{ height: `${HEIGHT}px` }">
      <!-- Skeleton -->
      <ChartSkeleton
        v-if="loading && !series"
        label="Loading macro chart"
      />

      <!-- Error -->
      <div
        v-else-if="error && !series"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6"
      >
        <IconTriangleAlert class="size-5 text-[var(--tape-down)]" />
        <p class="text-sm text-[var(--tape-down)] max-w-md">{{ error }}</p>
        <button class="btn-outline h-8 px-3 text-xs mt-1" @click="emit('refresh')">
          Retry
        </button>
      </div>

      <!-- Empty -->
      <div
        v-else-if="!plot"
        class="absolute inset-0 flex-center text-sm text-soft"
      >
        Insufficient data for this range
      </div>

      <!-- Chart -->
      <svg
        v-else
        ref="svgEl"
        :viewBox="`0 0 ${width} ${HEIGHT}`"
        :width="width"
        :height="HEIGHT"
        class="block w-full overflow-visible"
        @mousemove="onMove"
        @mouseleave="onLeave"
      >
        <defs>
          <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="lineColor" stop-opacity="0.28" />
            <stop offset="100%" :stop-color="lineColor" stop-opacity="0" />
          </linearGradient>
        </defs>

        <!-- Gridlines + y-axis labels -->
        <g>
          <line
            v-for="(_, i) in plot.yTicks"
            :key="`grid-${i}`"
            :x1="MARGIN.left"
            :x2="width - MARGIN.right"
            :y1="MARGIN.top + (innerH * (plot.yTicks.length - 1 - i)) / (plot.yTicks.length - 1)"
            :y2="MARGIN.top + (innerH * (plot.yTicks.length - 1 - i)) / (plot.yTicks.length - 1)"
            stroke="var(--tape-border)"
            stroke-width="1"
            stroke-dasharray="2 4"
            vector-effect="non-scaling-stroke"
          />
          <text
            v-for="(t, i) in plot.yTicks"
            :key="`yl-${i}`"
            :x="MARGIN.left - 8"
            :y="MARGIN.top + (innerH * (plot.yTicks.length - 1 - i)) / (plot.yTicks.length - 1) + 3"
            text-anchor="end"
            class="text-[10px] fill-[var(--tape-text-soft)]"
            font-family="JetBrains Mono, monospace"
          >
            {{ formatAxis(t) }}
          </text>
        </g>

        <!-- Zero line emphasis (for percent / mom transforms) -->
        <line
          v-if="
            (config.format === 'percent_signed' || config.transform === 'mom') &&
            plot.yMin <= 0 && plot.yMax >= 0
          "
          :x1="MARGIN.left"
          :x2="width - MARGIN.right"
          :y1="MARGIN.top + (1 - (0 - plot.yMin) / (plot.yMax - plot.yMin)) * innerH"
          :y2="MARGIN.top + (1 - (0 - plot.yMin) / (plot.yMax - plot.yMin)) * innerH"
          stroke="var(--tape-border-hover)"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />

        <!-- Area fill -->
        <path :d="plot.area" :fill="`url(#${gradientId})`" />

        <!-- Line -->
        <path
          :d="plot.line"
          fill="none"
          :stroke="lineColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />

        <!-- X-axis labels -->
        <g>
          <text
            v-for="(t, i) in plot.xTicks"
            :key="`xl-${i}`"
            :x="t.x"
            :y="HEIGHT - 8"
            text-anchor="middle"
            class="text-[10px] fill-[var(--tape-text-soft)]"
            font-family="JetBrains Mono, monospace"
          >
            {{ t.label }}
          </text>
        </g>

        <!-- Crosshair -->
        <g v-if="hoverPoint">
          <line
            :x1="hoverPoint.x"
            :x2="hoverPoint.x"
            :y1="MARGIN.top"
            :y2="MARGIN.top + innerH"
            stroke="var(--tape-border-hover)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <circle
            :cx="hoverPoint.x"
            :cy="hoverPoint.y"
            r="4"
            :fill="lineColor"
            stroke="var(--tape-bg-elev)"
            stroke-width="2"
          />
        </g>
      </svg>

      <!-- Hover tooltip (HTML overlay) -->
      <div
        v-if="hoverPoint && tooltipPos"
        class="absolute pointer-events-none surface px-3 py-2 text-xs shadow-lg"
        :style="tooltipPos"
      >
        <div class="text-[10px] uppercase tracking-wider text-soft">
          {{ new Date(hoverPoint.point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }}
        </div>
        <div class="text-mono font-semibold mt-0.5">
          {{ formatValue(hoverPoint.point.value) }}
        </div>
      </div>
    </div>

    <!-- Footer: range switcher + last updated -->
    <footer class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex gap-1">
        <button
          v-for="r in RANGES"
          :key="r"
          class="px-2.5 h-7 rounded-lg text-[11px] font-medium tracking-wide transition-colors"
          :class="
            range === r
              ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
              : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
          "
          @click="range = r"
        >
          {{ r }}
        </button>
      </div>
      <div class="text-[10px] text-soft tracking-wide">
        <span v-if="fredPubRel">FRED revised {{ fredPubRel }}</span>
        <span v-if="fredPubRel && lastUpdatedRel" class="mx-1.5">·</span>
        <span v-if="lastUpdatedRel">Cached {{ lastUpdatedRel }}</span>
      </div>
    </footer>
  </article>
</template>
