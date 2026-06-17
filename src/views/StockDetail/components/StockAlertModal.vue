<script setup lang="ts">
import type { AlertType } from '@/stores/alerts'
import type { StockAlertForm } from '../types'

const props = defineProps<{
  open: boolean
  form: StockAlertForm
  title: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
  (e: 'update:form', value: StockAlertForm): void
}>()

function updateType(value: string): void {
  emit('update:form', { ...props.form, type: value as AlertType })
}

function updateThreshold(value: string): void {
  emit('update:form', { ...props.form, threshold: value })
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 sm:px-4 py-4 sm:py-0 overflow-y-auto"
    @click.self="$emit('close')"
  >
    <article class="surface w-full max-w-md p-4 sm:p-6 space-y-4">
      <h3 class="text-base font-semibold">New alert - {{ title }}</h3>
      <div class="space-y-3 text-sm">
        <label class="block">
          <span class="text-[10px] uppercase tracking-wider text-soft">Trigger</span>
          <select
            :value="form.type"
            class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
            @change="updateType(($event.target as HTMLSelectElement).value)"
          >
            <option value="priceAbove">Price -(absolute)</option>
            <option value="priceBelow">Price -(absolute)</option>
            <option value="changePctUp">% change -(vs prev close)</option>
            <option value="changePctDown">% change -(vs prev close)</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ form.type.startsWith('changePct') ? 'Threshold (%)' : 'Threshold (price)' }}
          </span>
          <input
            :value="form.threshold"
            type="number"
            step="any"
            :placeholder="form.type.startsWith('changePct') ? 'e.g. 5 or -3' : 'e.g. 200'"
            class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
            @input="updateThreshold(($event.target as HTMLInputElement).value)"
          />
        </label>
        <p class="text-[10px] text-soft">
          Fires once when the condition is met. Re-arm from the Alerts page.
        </p>
      </div>
      <div class="flex flex-col-reverse xs:flex-row xs:items-center xs:justify-end gap-2 pt-2">
        <button class="btn-ghost h-9 xs:h-8 px-3 text-xs" @click="$emit('close')">
          Cancel
        </button>
        <button class="btn-primary h-9 xs:h-8 px-3 text-xs" @click="$emit('save')">Save</button>
      </div>
    </article>
  </div>
</template>
