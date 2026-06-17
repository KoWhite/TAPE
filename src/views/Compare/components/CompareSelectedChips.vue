<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatPercent } from '@/utils/format'
import type { CompareRankedItem } from '../types'

const { t } = useI18n()

defineProps<{ items: CompareRankedItem[] }>()

const emit = defineEmits<{ remove: [code: string] }>()
</script>

<template>
  <div v-if="items.length" class="flex flex-wrap items-center gap-2">
    <span class="text-[10px] uppercase tracking-wider text-soft mr-1">
      {{ t('compare.selected') }}
    </span>
    <span
      v-for="r in items"
      :key="r.code"
      class="pill border border-[var(--tape-border)] gap-2"
      :style="{ borderColor: r.color }"
    >
      <span
        class="inline-block w-2.5 h-2.5 rounded-full"
        :style="{ background: r.color }"
      />
      <span class="font-semibold">{{ r.symbol }}</span>
      <span
        v-if="r.loaded"
        class="text-mono"
        :class="
          r.ret > 0
            ? 'text-[var(--tape-up)]'
            : r.ret < 0
            ? 'text-[var(--tape-down)]'
            : 'text-soft'
        "
      >
        {{ formatPercent(r.ret) }}
      </span>
      <span v-else-if="r.error" class="text-[var(--tape-down)] text-[10px]">{{ t('compare.err') }}</span>
      <span v-else class="text-soft text-[10px]">--</span>
      <button
        class="ml-1 size-3 flex-center text-soft hover:text-[var(--tape-down)]"
        :title="t('compare.remove', { symbol: r.symbol })"
        @click="emit('remove', r.code)"
      >
        <IconLucideX class="size-3" />
      </button>
    </span>
  </div>
</template>
