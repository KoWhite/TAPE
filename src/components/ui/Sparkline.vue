<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    points: number[]
    width?: number
    height?: number
    stroke?: string
    fill?: string
    strokeWidth?: number
  }>(),
  {
    width: 120,
    height: 36,
    strokeWidth: 1.5,
  },
)

const path = computed(() => {
  const pts = props.points
  if (!pts || pts.length < 2) return { line: '', area: '' }

  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const range = max - min || 1
  const stepX = props.width / (pts.length - 1)

  const coords = pts.map((p, i) => {
    const x = i * stepX
    const y = props.height - ((p - min) / range) * props.height
    return [x, y] as const
  })

  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ')

  const area = `${line} L${props.width.toFixed(2)},${props.height.toFixed(2)} L0,${props.height.toFixed(2)} Z`

  return { line, area }
})

const trendColor = computed(() => {
  if (props.stroke) return props.stroke
  const pts = props.points
  if (!pts || pts.length < 2) return 'var(--tape-text-soft)'
  return pts[pts.length - 1] >= pts[0] ? 'var(--tape-up)' : 'var(--tape-down)'
})

const trendFill = computed(() => {
  if (props.fill) return props.fill
  const pts = props.points
  if (!pts || pts.length < 2) return 'transparent'
  return pts[pts.length - 1] >= pts[0]
    ? 'var(--tape-up-soft)'
    : 'var(--tape-down-soft)'
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    preserveAspectRatio="none"
    class="block overflow-visible"
  >
    <path
      v-if="path.area"
      :d="path.area"
      :fill="trendFill"
      stroke="none"
    />
    <path
      v-if="path.line"
      :d="path.line"
      fill="none"
      :stroke="trendColor"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
