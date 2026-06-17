<script setup lang="ts">
import { computed } from 'vue'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconActivity from '~icons/lucide/activity'
import IconPercent from '~icons/lucide/percent'
import IconArrowDownToLine from '~icons/lucide/arrow-down-to-line'
import IconTarget from '~icons/lucide/target'
import IconArrowLeftRight from '~icons/lucide/arrow-left-right'
import type { BacktestStats } from '@/types/backtest'
import { formatPercent } from '@/utils/format'

/**
 * Compact stats grid -the "is this strategy any good" panel. Each tile
 * shows one headline metric with a small interpretation cue (color,
 * icon) so the user can scan instead of read.
 */

interface Props {
  stats: BacktestStats | null
}

const props = defineProps<Props>()

interface Tile {
  key: string
  label: string
  value: string
  /** Tone derived from the value (good/bad/neutral). */
  tone: 'up' | 'down' | 'neutral'
  icon: unknown
  hint?: string
}

const tiles = computed<Tile[]>(() => {
  const s = props.stats
  if (!s) return []
  const ret = s.totalReturn
  const alpha = s.alpha
  const sharpe = s.sharpe
  const dd = s.maxDrawdown

  const toneOfReturn = (v: number): Tile['tone'] =>
    v > 0.0005 ? 'up' : v < -0.0005 ? 'down' : 'neutral'

  return [
    {
      key: 'totalReturn',
      label: 'Total Return',
      value: formatPercent(ret),
      tone: toneOfReturn(ret),
      icon: IconTrendingUp,
      hint: `vs benchmark ${formatPercent(s.benchmarkReturn)}`,
    },
    {
      key: 'alpha',
      label: 'Alpha vs B&H',
      value: formatPercent(alpha),
      tone: toneOfReturn(alpha),
      icon: alpha >= 0 ? IconTrendingUp : IconTrendingDown,
      hint: alpha >= 0 ? 'Beat the benchmark' : 'Underperformed B&H',
    },
    {
      key: 'sharpe',
      label: 'Sharpe',
      value: Number.isFinite(sharpe) ? sharpe.toFixed(2) : '--',
      tone: sharpe >= 1 ? 'up' : sharpe <= 0 ? 'down' : 'neutral',
      icon: IconActivity,
      hint: sharpe >= 2 ? 'Excellent' : sharpe >= 1 ? 'Good' : sharpe >= 0 ? 'Marginal' : 'Negative',
    },
    {
      key: 'sortino',
      label: 'Sortino',
      value: Number.isFinite(s.sortino) ? s.sortino.toFixed(2) : '--',
      tone: s.sortino >= 1 ? 'up' : s.sortino <= 0 ? 'down' : 'neutral',
      icon: IconActivity,
      hint: 'Downside-only Sharpe',
    },
    {
      key: 'maxDrawdown',
      label: 'Max Drawdown',
      value: dd > 0 ? `-${formatPercent(dd).replace('+', '')}` : '0.00%',
      // Drawdown is always "bad" -color it red when material.
      tone: dd > 0.05 ? 'down' : 'neutral',
      icon: IconArrowDownToLine,
      hint: 'Worst peak-to-trough drop',
    },
    {
      key: 'winRate',
      label: 'Win Rate',
      value: formatPercent(s.winRate),
      tone: s.winRate >= 0.5 ? 'up' : 'neutral',
      icon: IconTarget,
      hint: `${s.numTrades} closed trades`,
    },
    {
      key: 'profitFactor',
      label: 'Profit Factor',
      value: Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '--',
      tone: s.profitFactor >= 1.5 ? 'up' : s.profitFactor < 1 ? 'down' : 'neutral',
      icon: IconPercent,
      hint: 'Gross profit / gross loss',
    },
    {
      key: 'numTrades',
      label: 'Trades',
      value: String(s.numTrades),
      tone: 'neutral',
      icon: IconArrowLeftRight,
      hint: `Avg win ${formatPercent(s.avgWin)} · loss ${formatPercent(s.avgLoss)}`,
    },
  ]
})

function toneClass(tone: Tile['tone']): string {
  if (tone === 'up') return 'text-[var(--tape-up)]'
  if (tone === 'down') return 'text-[var(--tape-down)]'
  return 'text-[var(--tape-text)]'
}
</script>

<template>
  <div v-if="tiles.length" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
    <article
      v-for="t in tiles"
      :key="t.key"
      class="rounded-xl border border-[var(--tape-border)] hover:border-[var(--tape-border-hover)] transition-colors p-3.5"
    >
      <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-soft">
        <component :is="t.icon" class="size-3" />
        {{ t.label }}
      </div>
      <div
        class="text-mono text-xl sm:text-2xl font-semibold tabular-nums tracking-tight mt-1"
        :class="toneClass(t.tone)"
      >
        {{ t.value }}
      </div>
      <div v-if="t.hint" class="text-[10px] text-soft mt-1 truncate" :title="t.hint">
        {{ t.hint }}
      </div>
    </article>
  </div>
  <div v-else class="text-center py-6 text-sm text-soft">No stats yet.</div>
</template>
