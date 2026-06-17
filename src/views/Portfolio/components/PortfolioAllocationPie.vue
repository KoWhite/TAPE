<script setup lang="ts">
import { ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { useECharts } from '@/composables/useECharts'
import { getThemeTokens, withAlpha, MONO_FONT } from '@/utils/echartsTheme'
import type { BreakdownGroup } from '@/utils/portfolioBreakdown'

const props = defineProps<{
  groups: BreakdownGroup[]
}>()

const root = ref<HTMLElement | null>(null)

/** Categorical palette — accent-led, theme-agnostic hues that read on both
 *  light and dark surfaces. Cycled across groups; the last bucket reuses a
 *  muted grey for the long tail. */
const PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#a855f7', '#84cc16',
]

function buildOption(): EChartsOption | null {
  if (!props.groups.length) return null
  const t = getThemeTokens()
  const data = props.groups.map((g, i) => ({
    name: g.label,
    value: Number(g.value.toFixed(2)),
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }))

  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: t.bgElev,
      borderColor: t.border,
      textStyle: { color: t.text, fontFamily: MONO_FONT, fontSize: 12 },
      formatter: (info: unknown) => {
        const p = info as { name: string; value: number; percent: number; color: string }
        return (
          `<div style="font-family:${MONO_FONT};min-width:140px">` +
          `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>` +
          `<span style="font-weight:600">${p.name}</span>` +
          `<div style="margin-top:4px;color:${t.textSoft}">${p.value.toLocaleString()} · <span style="color:${t.text};font-weight:600">${p.percent.toFixed(1)}%</span></div>` +
          `</div>`
        )
      },
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 0,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 8,
      textStyle: { color: t.textSoft, fontFamily: MONO_FONT, fontSize: 11 },
      pageTextStyle: { color: t.textSoft },
      pageIconColor: t.textSoft,
      pageIconInactiveColor: withAlpha(t.textSoft, 0.4),
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['34%', '50%'],
        avoidLabelOverlap: true,
        padAngle: 1,
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scaleSize: 6,
          label: {
            show: true,
            formatter: '{b}\n{d}%',
            color: t.text,
            fontFamily: MONO_FONT,
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 18,
          },
        },
        data,
      },
    ],
  }
}

useECharts(root, buildOption)
</script>

<template>
  <div ref="root" class="w-full" style="height: 220px" />
</template>
