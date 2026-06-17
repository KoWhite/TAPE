<script setup lang="ts">
import BacktestEquityChart from './BacktestEquityChart.vue'
import BacktestStatsGrid from './BacktestStatsGrid.vue'
import BacktestTradesTable from './BacktestTradesTable.vue'
import { formatPercent } from '@/utils/format'
import type { BacktestResult } from '@/types/backtest'

const props = defineProps<{
  result: BacktestResult
  providersLoading: boolean
  hasConfiguredProvider: boolean
  explainLoading: boolean
  explainError: string | null
  explainContent: string | null
}>()

const emit = defineEmits<{ explain: [] }>()

const dslNoTrades = computed(() =>
  props.result.strategyId === 'dsl'
  && props.result.trades.length === 0
  && Math.abs(props.result.finalEquity - props.result.initialCapital) < 1e-6,
)
</script>

<template>
  <article class="surface p-4 sm:p-5 space-y-3">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold tracking-tight">Performance</h3>
        <span class="text-[10px] text-soft tracking-wider uppercase">
          {{ result.startDate }} - {{ result.endDate }}
        </span>
      </div>
      <div
        class="text-mono text-sm tabular-nums"
        :title="`Final equity from $${result.initialCapital}`"
      >
        <span class="text-soft">Final:</span>
        <span class="font-semibold ml-1">{{ result.finalEquity.toFixed(2) }}</span>
      </div>
    </header>
    <BacktestStatsGrid v-if="result.stats" :stats="result.stats" />
    <div
      v-if="dslNoTrades"
      class="rounded-lg border border-[var(--tape-warn)]/40 bg-[rgba(217,119,6,0.08)] px-3 py-2 text-xs text-[var(--tape-warn)] leading-relaxed"
    >
      This composed DSL ran successfully, but it produced no entry signals in the selected date range,
      so final equity stayed equal to initial capital. Try a longer window or loosen the entry rule.
    </div>
  </article>

  <article class="surface p-4 sm:p-5 space-y-3">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconLucideFileText class="size-4 text-[var(--tape-accent)]" />
        <h3 class="text-sm font-semibold tracking-tight">AI Explain</h3>
        <span
          v-if="!providersLoading && !hasConfiguredProvider"
          class="text-[10px] text-[var(--tape-down)] tracking-wider uppercase"
        >
          API key missing
        </span>
      </div>
      <button
        class="btn-primary h-8 px-3 text-xs"
        :disabled="explainLoading || !hasConfiguredProvider"
        @click="emit('explain')"
      >
        <IconLucideSparkles class="size-3" :class="explainLoading && 'animate-pulse'" />
        {{ explainLoading ? 'Explaining...' : 'Explain result' }}
      </button>
    </header>

    <div
      v-if="explainError"
      class="text-xs text-[var(--tape-down)] flex items-center gap-1.5"
    >
      <IconLucideTriangleAlert class="size-3.5" />
      {{ explainError }}
    </div>
    <div
      v-if="explainContent"
      class="whitespace-pre-line break-words text-sm leading-relaxed text-muted bg-[var(--tape-input)] border border-[var(--tape-border)] rounded-lg p-3 overflow-visible"
    >
      {{ explainContent }}<span v-if="explainLoading" class="animate-pulse text-[var(--tape-accent)]">|</span>
    </div>
    <div
      v-else-if="explainLoading"
      class="space-y-2 bg-[var(--tape-input)] border border-[var(--tape-border)] rounded-lg p-3"
    >
      <div class="h-3 skeleton rounded-full w-5/6" />
      <div class="h-3 skeleton rounded-full w-3/4" />
      <div class="h-3 skeleton rounded-full w-4/5" />
    </div>
    <p v-else class="text-xs text-soft leading-relaxed">
      Run Explain after a backtest to get a concise read on return, drawdown,
      trade quality, benchmark gap, and whether the result looks actionable.
    </p>
  </article>

  <article class="surface p-4 sm:p-5 space-y-3">
    <header class="flex items-center gap-2">
      <h3 class="text-sm font-semibold tracking-tight">Equity vs Benchmark</h3>
      <span
        v-if="result.stats"
        class="text-[10px] text-soft tracking-wider uppercase"
      >
        alpha
        <span
          class="text-mono normal-case ml-1"
          :class="
            result.stats.alpha > 0
              ? 'text-[var(--tape-up)]'
              : result.stats.alpha < 0
              ? 'text-[var(--tape-down)]'
              : 'text-soft'
          "
        >
          {{ formatPercent(result.stats.alpha) }}
        </span>
      </span>
    </header>
    <BacktestEquityChart
      :equity="result.equityCurve"
      :benchmark="result.benchmarkCurve"
      :drawdown="result.drawdownCurve"
    />
  </article>

  <article class="surface p-4 sm:p-5 space-y-3">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold tracking-tight">Trades</h3>
        <span class="text-[10px] text-soft tracking-wider uppercase">
          {{ result.trades.length }} total
        </span>
      </div>
    </header>
    <BacktestTradesTable :trades="result.trades" />
  </article>
</template>
