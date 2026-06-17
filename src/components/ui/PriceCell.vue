<script setup lang="ts">
import { ref, watch } from 'vue'
import { formatNumber } from '@/utils/format'
import { useSettingsStore } from '@/stores/settings'

const props = withDefaults(
  defineProps<{
    value: number
    digits?: number
    size?: 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  {
    digits: 2,
    size: 'md',
  },
)

const settings = useSettingsStore()
const flash = ref<'up' | 'down' | null>(null)
const prev = ref(props.value)

watch(
  () => props.value,
  (next, last) => {
    if (!settings.flashOnTick) return
    if (next > last) flash.value = 'up'
    else if (next < last) flash.value = 'down'
    prev.value = last
    window.setTimeout(() => (flash.value = null), 700)
  },
)
</script>

<template>
  <span
    class="text-mono font-semibold inline-block px-1 -mx-1 rounded transition-colors"
    :class="{
      'text-base': size === 'sm',
      'text-lg': size === 'md',
      'text-2xl': size === 'lg',
      'text-3xl sm:text-4xl': size === 'xl',
      'tick-flash-up': flash === 'up',
      'tick-flash-down': flash === 'down',
    }"
  >
    {{ formatNumber(value, digits) }}
  </span>
</template>
