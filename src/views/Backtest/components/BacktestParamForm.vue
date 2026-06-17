<script setup lang="ts">
import type { StrategyMeta } from '@/types/backtest'

/**
 * Dynamic parameter form for a strategy. Same shape and behavior as
 * IndicatorParamForm (but kept as its own component to allow Stage C
 * to add LLM-specific affordances without disturbing the shared one).
 */

interface Props {
  meta: StrategyMeta
  modelValue: Record<string, number>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, number>): void
}>()

function valueOf(name: string): number {
  const v = props.modelValue[name]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const spec = props.meta.params.find((p) => p.name === name)
  return spec?.default ?? 0
}

function setValue(name: string, raw: string | number): void {
  const num = typeof raw === 'string' ? Number(raw) : raw
  if (!Number.isFinite(num)) return
  const spec = props.meta.params.find((p) => p.name === name)
  let bounded = num
  if (spec?.min != null) bounded = Math.max(spec.min, bounded)
  if (spec?.max != null) bounded = Math.min(spec.max, bounded)
  if (spec?.type === 'int') bounded = Math.round(bounded)
  emit('update:modelValue', { ...props.modelValue, [name]: bounded })
}

function stepFor(spec: StrategyMeta['params'][number]): number {
  if (spec.step != null) return spec.step
  return spec.type === 'int' ? 1 : 0.1
}
</script>

<template>
  <div v-if="meta.params.length" class="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-3">
    <label v-for="spec in meta.params" :key="spec.name" class="block">
      <span class="text-[10px] uppercase tracking-wider text-soft">
        {{ spec.label }}
      </span>
      <input
        type="number"
        :value="valueOf(spec.name)"
        :min="spec.min ?? undefined"
        :max="spec.max ?? undefined"
        :step="stepFor(spec)"
        class="mt-1 w-full px-2.5 h-8 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono text-sm tabular-nums focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
        @input="setValue(spec.name, ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
  <p v-else class="text-[11px] text-soft italic">
    This strategy has no parameters.
  </p>
</template>
