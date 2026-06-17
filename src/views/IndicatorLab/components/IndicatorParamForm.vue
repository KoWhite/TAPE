<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { IndicatorMeta } from '@/types/indicator'

const { t } = useI18n()

/**
 * Dynamic param form for one active indicator instance. Reads the param
 * spec from the registry meta and renders one number input per param.
 *
 * Two-way binding via v-model on `params`. Empty/invalid input keeps
 * the previous value rather than emitting NaN -keeps the indicator
 * compute stable while the user is mid-typing.
 */

interface Props {
  meta: IndicatorMeta
  modelValue: Record<string, number>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, number>): void
}>()

/** Resolve the current value for a param, falling back to its default
 *  when the host hasn't supplied one yet. */
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

function stepFor(spec: IndicatorMeta['params'][number]): number {
  if (spec.step != null) return spec.step
  return spec.type === 'int' ? 1 : 0.1
}

const noParams = computed(() => props.meta.params.length === 0)
</script>

<template>
  <div v-if="!noParams" class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
    <label
      v-for="spec in meta.params"
      :key="spec.name"
      class="block"
    >
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
    {{ t('indicators.noParams') }}
  </p>
</template>
