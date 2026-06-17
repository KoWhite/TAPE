<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import { useECharts } from '@/composables/useECharts'
import { getThemeTokens, withAlpha, MONO_FONT } from '@/utils/echartsTheme'
import type { BreakdownGroup } from '@/utils/portfolioBreakdown'

const props = defineProps<{
  groups: BreakdownGroup[]
}>()

const root = ref<HTMLElement | null>(null)

/** Largest absolute contributors first, capped so a long tail of tiny
 *  positions doesn't crush the bars. Reversed because echarts category axis
 *  draws bottom-up and we want the biggest contributor on top. */
const ranked = computed(() =>
  [...props.groups]
    .filter((g) => Math.abs(g.unrealizedPnl) > 0)
    .sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl))
    .slice(0, 12)
    .reverse(),
)

function buildOption(): EChartsOption | null {
  if (!ranked.value.length) return null
  const t = getThemeTokens()
  const labels = ranked.value.map((g) => g.label)
  const values = ranked.value.map((g) => ({
    value: Number(g.unrealizedPnl.toFixed(2)),
    itemStyle: { color: g.unrealizedPnl >= 0 ? t.up : t.down },
  }))

  return {
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: t.bgElev,
      borderColor: t.border,
      textStyle: { color: t.text, fontFamily: MONO_FONT, fontSize: 12 },
      formatter: (info: unknown) => {
        const arr = info as Array<{ name: string; value: number; color: string }>
        const p = arr[0]
        if (!p) return ''
        const col = p.value >= 0 ? t.up : t.down
        const sign = p.value >= 0 ? '+' : ''
        return (
          `<div style="font-family:${MONO_FONT}"><span style="font-weight:600">${p.name}</span>` +
          `<div style="margin-top:4px;color:${col};font-weight:600">${sign}${p.value.toLocaleString()}</div></div>`
        )
      },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: withAlpha(t.border, 0.6) } },
      axisLabel: { color: t.textSoft, fontFamily: MONO_FONT, fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: t.border } },
      axisTick: { show: false },
      axisLabel: { color: t.textSoft, fontFamily: MONO_FONT, fontSize: 11 },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 18,
        itemStyle: { borderRadius: 2 },
        label: {
          show: true,
          position: 'right',
          color: t.textSoft,
          fontFamily: MONO_FONT,
          fontSize: 10,
          formatter: (info: unknown) => {
            const v = Number((info as { value: number }).value)
            return (v >= 0 ? '+' : '') + v.toLocaleString()
          },
        },
      },
    ],
  }
}

useECharts(root, buildOption)
</script>

<template>
  <div ref="root" class="w-full" style="height: 260px" />
</template>
