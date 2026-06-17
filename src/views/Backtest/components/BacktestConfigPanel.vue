<script setup lang="ts">
import BacktestParamForm from './BacktestParamForm.vue'
import { DateInput } from '@/components/ui/date-input'
import type { StrategyMeta } from '@/types/backtest'

defineProps<{
  meta: StrategyMeta | null
  symbolInput: string
  initialCapital: number
  startDate: string
  endDate: string
  numericParams: Record<string, number>
  composedDslJson: string
  isRunning: boolean
  validationError?: string | null
}>()

const emit = defineEmits<{
  'update:symbolInput': [value: string]
  'update:initialCapital': [value: number]
  'update:startDate': [value: string]
  'update:endDate': [value: string]
  'update:numericParams': [value: Record<string, number>]
  applySymbol: []
  run: []
}>()
</script>

<template>
  <article class="surface p-4 sm:p-5 space-y-5">
    <header class="flex items-center gap-2">
      <h3 class="text-sm font-semibold tracking-tight">Configuration</h3>
    </header>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <label class="block sm:col-span-2">
        <span class="text-[10px] uppercase tracking-wider text-soft">Symbol</span>
        <input
          :value="symbolInput"
          type="text"
          placeholder="US.AAPL or AAPL"
          class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
          @input="emit('update:symbolInput', ($event.target as HTMLInputElement).value)"
          @keydown.enter="emit('applySymbol')"
          @blur="emit('applySymbol')"
        />
      </label>
      <label class="block">
        <span class="text-[10px] uppercase tracking-wider text-soft">Initial $</span>
        <input
          :value="initialCapital"
          type="number"
          min="100"
          step="100"
          class="mt-1 w-full px-3 h-9 rounded-lg bg-[var(--tape-input)] border border-[var(--tape-border)] text-mono tabular-nums focus:border-[var(--tape-accent)] focus:bg-[var(--tape-input-focus)] outline-none"
          @input="emit('update:initialCapital', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <DateInput
        :model-value="startDate"
        label="Start"
        :max="endDate"
        @update:model-value="emit('update:startDate', $event)"
      />
      <DateInput
        :model-value="endDate"
        label="End"
        :min="startDate"
        @update:model-value="emit('update:endDate', $event)"
      />
    </div>

    <div v-if="meta">
      <div class="text-[10px] uppercase tracking-wider text-soft mb-2">
        Parameters
      </div>
      <BacktestParamForm
        :meta="meta"
        :model-value="numericParams"
        @update:model-value="emit('update:numericParams', $event)"
      />
      <div v-if="composedDslJson" class="mt-3 space-y-1.5">
        <div class="text-[10px] uppercase tracking-wider text-soft">
          Generated DSL
        </div>
        <pre
          class="text-[11px] tabular-nums leading-snug bg-[var(--tape-input)] border border-[var(--tape-border)] rounded-md p-2 overflow-auto max-h-60"
        >{{ composedDslJson }}</pre>
      </div>
    </div>

    <div class="flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-3 pt-1">
      <button
        class="btn-primary h-10 xs:h-9 px-4 text-sm w-full xs:w-auto"
        :disabled="isRunning || !meta || Boolean(validationError)"
        @click="emit('run')"
      >
        <IconLucidePlay class="size-3.5" :class="isRunning && 'animate-pulse'" />
        {{ isRunning ? 'Running...' : 'Run backtest' }}
      </button>
      <slot name="meta" />
    </div>
    <p v-if="validationError" class="text-xs text-[var(--tape-down)]">
      {{ validationError }}
    </p>
  </article>
</template>
