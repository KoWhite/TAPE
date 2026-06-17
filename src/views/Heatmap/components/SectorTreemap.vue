<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { TreemapChart } from 'echarts/charts'
import { TooltipComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts } from 'echarts/core'
import type { EChartsOption } from 'echarts'

echarts.use([TreemapChart, TooltipComponent, TitleComponent, CanvasRenderer])

export interface HeatmapLeaf {
  code: string
  symbol: string
  /** Day change pct (decimal) — drives color. */
  changePct: number
  /** Sizing weight — usually market cap, falls back to absolute turnover or 1. */
  size: number
  /** Last price for tooltip. */
  last: number
  /** Sector name; uncategorized rows go into '—'. */
  sector: string
  industry?: string | null
}

interface Props {
  leaves: HeatmapLeaf[]
}

const props = defineProps<Props>()

const root = ref<HTMLDivElement | null>(null)
const instance = shallowRef<ECharts | null>(null)

/** Map a return into a Bloomberg-style red/green tile color. Magnitude
 *  caps at ±5% so a single 30% mover doesn't bleach the rest of the grid. */
function tileColor(ret: number): string {
  const mag = Math.min(1, Math.abs(ret) / 0.05)
  if (ret > 0) {
    // Green from neutral (#1f2937) → vivid (#16a34a)
    const r = Math.round(31 + (22 - 31) * mag)
    const g = Math.round(41 + (163 - 41) * mag)
    const b = Math.round(55 + (74 - 55) * mag)
    return `rgb(${r}, ${g}, ${b})`
  }
  if (ret < 0) {
    const r = Math.round(31 + (220 - 31) * mag)
    const g = Math.round(41 + (38 - 41) * mag)
    const b = Math.round(55 + (38 - 55) * mag)
    return `rgb(${r}, ${g}, ${b})`
  }
  return 'rgb(55, 65, 81)'
}

interface SectorBucket {
  name: string
  /** echarts treemap children — leaves only. */
  children: Array<{
    name: string
    value: number
    code: string
    last: number
    changePct: number
    sector: string
    industry?: string | null
    itemStyle: { color: string; borderColor: string }
  }>
}

const treemapData = computed(() => {
  const buckets = new Map<string, SectorBucket>()
  for (const leaf of props.leaves) {
    const sector = leaf.sector || '—'
    let bucket = buckets.get(sector)
    if (!bucket) {
      bucket = { name: sector, children: [] }
      buckets.set(sector, bucket)
    }
    bucket.children.push({
      name: leaf.symbol,
      value: Math.max(1, leaf.size),
      code: leaf.code,
      last: leaf.last,
      changePct: leaf.changePct,
      sector,
      industry: leaf.industry,
      itemStyle: {
        color: tileColor(leaf.changePct),
        borderColor: 'rgba(0, 0, 0, 0.35)',
      },
    })
  }
  // Sort sectors by aggregate weight descending so the biggest sectors
  // anchor the upper-left of the treemap (echarts squarify pattern).
  return [...buckets.values()]
    .map((b) => ({
      name: b.name,
      value: b.children.reduce((s, c) => s + c.value, 0),
      children: b.children.sort((a, b2) => b2.value - a.value),
    }))
    .sort((a, b) => b.value - a.value)
})

function buildOption(): EChartsOption {
  return {
    tooltip: {
      formatter: (info: unknown) => {
        const params = info as { data?: Record<string, unknown> }
        const d = params.data
        if (!d || !('changePct' in d)) return ''
        const ret = Number(d.changePct)
        const last = Number(d.last)
        const sector = String(d.sector || '—')
        const industry = String(d.industry || '')
        const sym = String(d.name || '')
        const sign = ret >= 0 ? '+' : ''
        const color = ret >= 0 ? '#22c55e' : '#ef4444'
        const industryLine = industry
          ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${industry}</div>`
          : ''
        return `
          <div style="font-family:JetBrains Mono,ui-monospace,monospace;min-width:160px">
            <div style="font-size:13px;font-weight:600">${sym}</div>
            <div style="font-size:11px;color:#9ca3af">${sector}</div>
            ${industryLine}
            <div style="margin-top:6px;font-size:13px">
              <span style="color:${color};font-weight:600">${sign}${(ret * 100).toFixed(2)}%</span>
              <span style="color:#9ca3af;margin-left:8px">last ${last.toFixed(2)}</span>
            </div>
          </div>
        `
      },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: 'link',
        breadcrumb: { show: false },
        // Two levels: sector (group) → ticker (leaf).
        levels: [
          {
            // Sector grouping — render as muted divider only.
            itemStyle: {
              borderColor: 'rgba(0, 0, 0, 0.6)',
              borderWidth: 4,
              gapWidth: 4,
            },
            upperLabel: {
              show: true,
              height: 20,
              color: '#cbd5e1',
              fontSize: 11,
              fontWeight: 600,
              padding: [4, 8, 4, 8],
              backgroundColor: 'rgba(15, 23, 42, 0.55)',
              borderRadius: 0,
              align: 'left',
            },
          },
          {
            // Ticker leaf level.
            itemStyle: {
              borderColor: 'rgba(0, 0, 0, 0.4)',
              borderWidth: 1,
              gapWidth: 1,
            },
            label: {
              show: true,
              formatter: (info: unknown) => {
                const params = info as { data?: Record<string, unknown> }
                const d = params.data
                if (!d) return ''
                const ret = Number((d as { changePct?: number }).changePct ?? 0)
                const sign = ret >= 0 ? '+' : ''
                return `{name|${d.name}}\n{pct|${sign}${(ret * 100).toFixed(2)}%}`
              },
              rich: {
                name: {
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  align: 'center',
                  padding: [0, 0, 2, 0],
                },
                pct: {
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 11,
                  align: 'center',
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                },
              },
            },
          },
        ],
        // Enabling responsive drill: empty children are hidden, not rendered.
        leafDepth: 2,
        upperLabel: { show: false },
        data: treemapData.value,
      },
    ],
  }
}

function render(): void {
  if (!instance.value) return
  instance.value.setOption(buildOption(), { notMerge: true })
}

function handleResize(): void {
  instance.value?.resize()
}

onMounted(() => {
  if (!root.value) return
  instance.value = echarts.init(root.value)
  render()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  instance.value?.dispose()
  instance.value = null
})

watch(
  () => props.leaves,
  () => render(),
  { deep: true },
)
</script>

<template>
  <div ref="root" class="w-full" style="height: 560px" />
</template>
