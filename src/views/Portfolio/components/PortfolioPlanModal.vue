<script setup lang="ts">
import type { PortfolioPlanEditing } from '../types'

const props = defineProps<{ modelValue: PortfolioPlanEditing | null }>()
const confirmClear = ref(false)

const emit = defineEmits<{
  (e: 'update:modelValue', value: PortfolioPlanEditing | null): void
  (e: 'save'): void
  (e: 'clear', code: string): void
}>()

function updateField(key: keyof PortfolioPlanEditing, value: string | boolean): void {
  if (!props.modelValue) return
  confirmClear.value = false
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function requestClear(): void {
  if (!confirmClear.value) {
    confirmClear.value = true
    return
  }
  if (props.modelValue) emit('clear', props.modelValue.code)
  confirmClear.value = false
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 sm:px-4 py-4 sm:py-0 overflow-y-auto"
    @click.self="$emit('update:modelValue', null)"
  >
    <article class="surface w-full max-w-md p-4 sm:p-6 space-y-4">
      <h3 class="text-base font-semibold">Exit plan · {{ modelValue.symbol }}</h3>
      <div class="space-y-3 text-sm">
        <div class="grid grid-cols-1 xs:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Take profit</span>
            <input
              :value="modelValue.takeProfitPrice"
              type="number"
              step="any"
              min="0"
              placeholder="Target price"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
              @input="updateField('takeProfitPrice', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Stop loss</span>
            <input
              :value="modelValue.stopLossPrice"
              type="number"
              step="any"
              min="0"
              placeholder="Stop price"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
              @input="updateField('stopLossPrice', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <label class="block">
          <span class="text-[10px] uppercase tracking-wider text-soft">Target weight (%)</span>
          <input
            :value="modelValue.targetWeight"
            type="number"
            step="any"
            min="0"
            max="100"
            class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
            @input="updateField('targetWeight', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex items-center gap-2 text-xs text-muted">
          <input
            :checked="modelValue.enabled"
            type="checkbox"
            class="accent-[var(--tape-accent)]"
            @change="updateField('enabled', ($event.target as HTMLInputElement).checked)"
          />
          Enable this plan
        </label>
        <label class="block">
          <span class="text-[10px] uppercase tracking-wider text-soft">Plan note</span>
          <input
            :value="modelValue.note"
            placeholder="Why this exit level matters"
            class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
            @input="updateField('note', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <div class="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 pt-2">
        <button
          class="h-8 px-3 rounded-lg text-xs transition-colors"
          :class="confirmClear ? 'bg-[var(--tape-down-soft)] text-[var(--tape-down)]' : 'bg-[var(--tape-button-bg)] text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'"
          @click="requestClear"
        >
          {{ confirmClear ? 'Confirm clear' : 'Clear' }}
        </button>
        <div class="flex flex-col-reverse xs:flex-row xs:items-center xs:justify-end gap-2">
          <button class="btn-ghost h-9 xs:h-8 px-3 text-xs" @click="$emit('update:modelValue', null)">
            Cancel
          </button>
          <button class="btn-primary h-9 xs:h-8 px-3 text-xs" @click="$emit('save')">Save</button>
        </div>
      </div>
    </article>
  </div>
</template>
