<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import IconWallet from '~icons/lucide/wallet'
import IconTrendingUp from '~icons/lucide/trending-up'
import IconTrendingDown from '~icons/lucide/trending-down'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconPlus from '~icons/lucide/plus'
import { usePortfolioStore } from '@/stores/portfolio'
import { usePortfolioHistoryStore } from '@/stores/portfolioHistory'
import { useQuotes } from '@/composables/useQuotes'
import { formatChange, formatPercent } from '@/utils/format'
import { getQuoteValuation } from '@/utils/quoteValuation'
import PortfolioHistoryChart from '@/components/portfolio/PortfolioHistoryChart.vue'

/**
 * Compact portfolio summary for the dashboard. Shows the headline numbers
 * (value / cost / P&L) plus an embedded history chart so the user can see
 * "where I am" and "how I got here" without leaving the home page.
 *
 * Today's P&L is computed from each position's `change` field -i.e. the
 * delta vs prev close, multiplied by share count. This is what most
 * brokers display as "Day Change" so it matches user expectations.
 */

const { t } = useI18n()
const portfolio = usePortfolioStore()
const { positions } = storeToRefs(portfolio)

const history = usePortfolioHistoryStore()
const { snapshots } = storeToRefs(history)

// Drives shared polling -needed so live prices update without a manual refresh.
const { quotes } = useQuotes()

interface Aggregate {
  cost: number
  value: number
  pnl: number
  pnlPct: number
  /** Day change in native currency, summed across positions. */
  dayChange: number
  /** Day change %, weighted by market value (closer to a "portfolio return"
   *  than naively summing percents). */
  dayChangePct: number
  /** Number of positions whose quote actually arrived this cycle. */
  pricedCount: number
}

const aggregate = computed<Aggregate>(() => {
  let cost = 0
  let value = 0
  let dayChange = 0
  let prevValue = 0
  let priced = 0
  for (const p of positions.value) {
    const q = quotes.value.get(p.code)
    const valuation = getQuoteValuation(q)
    cost += p.costBasis ?? p.shares * p.avgCost
    if (!valuation) continue
    priced++
    value += p.shares * valuation.price
    dayChange += p.shares * valuation.change
    // Weighting by yesterday's notional avoids dividing today's PnL by a
    // value that already includes today's gain.
    prevValue += valuation.changePct
      ? (p.shares * valuation.price) / (1 + valuation.changePct)
      : p.shares * (q?.prevClose ?? 0)
  }
  const realized = portfolio.closedPositions.reduce((s, p) => s + p.realizedPnl, 0) +
    positions.value.reduce((s, p) => s + p.realizedPnl + p.dividends, 0)
  const pnl = value - cost + realized
  return {
    cost,
    value,
    pnl,
    pnlPct: cost ? pnl / cost : 0,
    dayChange,
    dayChangePct: prevValue ? dayChange / prevValue : 0,
    pricedCount: priced,
  }
})

const isEmpty = computed(() => positions.value.length === 0)
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-5">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconWallet class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">{{ t('overview.portfolio.title') }}</h3>
        <span class="text-[10px] text-soft tracking-wider uppercase">
          {{ t('overview.portfolio.positions', positions.length) }}
        </span>
      </div>
      <RouterLink
        to="/portfolio"
        class="btn-ghost h-8 px-3 text-xs"
        :title="t('overview.portfolio.managePositions')"
      >
        {{ t('overview.portfolio.manage') }}
        <IconArrowRight class="size-3.5" />
      </RouterLink>
    </header>

    <!-- Empty state -->
    <div
      v-if="isEmpty"
      class="col-center py-10 text-center px-6"
    >
      <IconWallet class="size-9 text-soft mb-3" />
      <p class="text-base font-medium">{{ t('overview.portfolio.emptyTitle') }}</p>
      <p class="text-sm text-muted mt-1 max-w-sm">
        {{ t('overview.portfolio.emptyHint') }}
      </p>
      <RouterLink to="/portfolio" class="btn-primary mt-5 h-9 px-4 text-xs">
        <IconPlus class="size-4" />
        {{ t('overview.portfolio.addPosition') }}
      </RouterLink>
    </div>

    <!-- Summary numbers -->
    <div v-else class="space-y-5">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <!-- Market value (headline) -->
        <div class="col-span-2 sm:col-span-1">
          <div class="text-[10px] uppercase tracking-wider text-soft">
            {{ t('overview.portfolio.marketValue') }}
          </div>
          <div class="text-mono text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums mt-1">
            ${{ aggregate.value.toFixed(2) }}
          </div>
          <div
            v-if="aggregate.pricedCount < positions.length"
            class="text-[10px] text-soft mt-0.5"
          >
            {{ t('overview.portfolio.priced', { priced: aggregate.pricedCount, total: positions.length }) }}
          </div>
        </div>

        <!-- Today's change -->
        <div>
          <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1">
            <component
              :is="aggregate.dayChange >= 0 ? IconTrendingUp : IconTrendingDown"
              class="size-3"
            />
            {{ t('overview.portfolio.today') }}
          </div>
          <div
            class="text-mono text-lg font-semibold tabular-nums mt-1"
            :class="
              aggregate.dayChange > 0
                ? 'text-[var(--tape-up)]'
                : aggregate.dayChange < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatChange(aggregate.dayChange) }}
          </div>
          <div
            class="text-[11px] text-mono tabular-nums"
            :class="
              aggregate.dayChangePct > 0
                ? 'text-[var(--tape-up)]'
                : aggregate.dayChangePct < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatPercent(aggregate.dayChangePct) }}
          </div>
        </div>

        <!-- Total P&L -->
        <div>
          <div class="text-[10px] uppercase tracking-wider text-soft">
            {{ t('overview.portfolio.totalPnl') }}
          </div>
          <div
            class="text-mono text-lg font-semibold tabular-nums mt-1"
            :class="
              aggregate.pnl > 0
                ? 'text-[var(--tape-up)]'
                : aggregate.pnl < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatChange(aggregate.pnl) }}
          </div>
          <div
            class="text-[11px] text-mono tabular-nums"
            :class="
              aggregate.pnlPct > 0
                ? 'text-[var(--tape-up)]'
                : aggregate.pnlPct < 0
                ? 'text-[var(--tape-down)]'
                : 'text-soft'
            "
          >
            {{ formatPercent(aggregate.pnlPct) }}
          </div>
        </div>

        <!-- Cost basis -->
        <div>
          <div class="text-[10px] uppercase tracking-wider text-soft">
            {{ t('overview.portfolio.costBasis') }}
          </div>
          <div class="text-mono text-lg font-semibold tabular-nums text-soft mt-1">
            {{ aggregate.cost.toFixed(2) }}
          </div>
        </div>
      </div>

      <!-- History chart -->
      <PortfolioHistoryChart :snapshots="snapshots" />
    </div>
  </article>
</template>
