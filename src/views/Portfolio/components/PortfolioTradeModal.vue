<script setup lang="ts">
import type { PortfolioTradeEditing } from '../types'

const props = defineProps<{
  modelValue: PortfolioTradeEditing | null
  maxShares?: number
  error?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PortfolioTradeEditing | null): void
  (e: 'save'): void
}>()

const title = computed(() => {
  if (!props.modelValue) return ''
  if (props.modelValue.mode === 'buy') return props.modelValue.code ? 'Buy / add shares' : 'Add position'
  if (props.modelValue.mode === 'close') return 'Close position'
  return 'Sell / reduce shares'
})

function updateField(key: keyof PortfolioTradeEditing, value: string): void {
  if (!props.modelValue) return
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 px-3 sm:px-4 py-4 sm:py-0 overflow-y-auto"
    @click.self="$emit('update:modelValue', null)"
  >
    <article class="surface w-full max-w-lg p-4 sm:p-6 space-y-4">
      <h3 class="text-base font-semibold">{{ title }}</h3>
      <div
        v-if="error"
        class="rounded-lg border border-[var(--tape-down-soft)] bg-[var(--tape-down-soft)] px-3 py-2 text-xs text-[var(--tape-down)]"
        role="alert"
      >
        {{ error }}
      </div>
      <div class="space-y-3 text-sm">
        <div class="grid grid-cols-1 xs:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Code</span>
            <input
              :value="modelValue.code"
              :disabled="modelValue.mode !== 'buy' || Boolean(modelValue.code)"
              placeholder="US.AAPL"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none disabled:opacity-70"
              @input="updateField('code', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Symbol</span>
            <input
              :value="modelValue.symbol"
              :disabled="modelValue.mode !== 'buy' || Boolean(modelValue.symbol)"
              placeholder="AAPL"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none disabled:opacity-70"
              @input="updateField('symbol', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <div class="grid grid-cols-1 xs:grid-cols-3 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Shares</span>
            <input
              :value="modelValue.shares"
              :disabled="modelValue.mode === 'close'"
              type="number"
              step="any"
              min="0"
              :max="maxShares"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none disabled:opacity-70"
              @input="updateField('shares', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Price</span>
            <input
              :value="modelValue.price"
              type="number"
              step="any"
              min="0"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
              @input="updateField('price', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Fee</span>
            <input
              :value="modelValue.fee"
              type="number"
              step="any"
              min="0"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
              @input="updateField('fee', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <div class="grid grid-cols-1 xs:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Date</span>
            <input
              :value="modelValue.date"
              type="date"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
              @input="updateField('date', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label v-if="modelValue.mode !== 'buy'" class="block">
            <span class="text-[10px] uppercase tracking-wider text-soft">Reason</span>
            <select
              :value="modelValue.reason"
              class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
              @change="updateField('reason', ($event.target as HTMLSelectElement).value)"
            >
              <option value="manual">Manual</option>
              <option value="takeProfit">Take profit</option>
              <option value="stopLoss">Stop loss</option>
              <option value="rebalance">Rebalance</option>
            </select>
          </label>
        </div>

        <label class="block">
          <span class="text-[10px] uppercase tracking-wider text-soft">Note</span>
          <input
            :value="modelValue.note"
            placeholder="Lot date / thesis / exit reason"
            class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
            @input="updateField('note', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <div class="flex flex-col-reverse xs:flex-row xs:items-center xs:justify-end gap-2 pt-2">
        <button class="btn-ghost h-9 xs:h-8 px-3 text-xs" @click="$emit('update:modelValue', null)">
          Cancel
        </button>
        <button class="btn-primary h-9 xs:h-8 px-3 text-xs" @click="$emit('save')">Save</button>
      </div>
      <p class="text-[10px] text-soft">
        Saved to local SQLite through the Tape bridge, with browser storage as fallback.
      </p>
    </article>
  </div>
</template>
