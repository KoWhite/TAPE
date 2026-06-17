<script setup lang="ts">
import IconActivity from '~icons/lucide/activity'
import IconArrowDownToLine from '~icons/lucide/arrow-down-to-line'
import IconArrowUpFromLine from '~icons/lucide/arrow-up-from-line'
import IconBadgeDollarSign from '~icons/lucide/badge-dollar-sign'
import IconCircleDollarSign from '~icons/lucide/circle-dollar-sign'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import IconReceiptText from '~icons/lucide/receipt-text'
import IconSigma from '~icons/lucide/sigma'
import { computed } from 'vue'
import { formatChange, formatPercent } from '@/utils/format'
import type { PortfolioAnalytics } from '@/utils/portfolioAnalytics'

const props = defineProps<{
  analytics: PortfolioAnalytics
}>()

const topAttribution = computed(() => props.analytics.attribution.slice(0, 8))
const recentCashflow = computed(() => props.analytics.cashflow.slice(-12))
const maxMonthlyAbs = computed(() =>
  Math.max(1, ...recentCashflow.value.map((row) => Math.abs(row.netInvestmentCash))),
)

function tone(value: number): string {
  if (value > 0) return 'text-[var(--tape-up)]'
  if (value < 0) return 'text-[var(--tape-down)]'
  return 'text-soft'
}

function widthPct(value: number): string {
  return `${Math.max(3, Math.min(100, (Math.abs(value) / maxMonthlyAbs.value) * 100))}%`
}
</script>

<template>
  <article v-if="analytics.attribution.length || analytics.cashflow.length" class="surface overflow-hidden">
    <header class="px-4 py-3 border-b border-[var(--tape-border)] flex items-center gap-2">
      <IconSigma class="size-4 text-[var(--tape-accent)]" />
      <div>
        <h3 class="font-semibold tracking-tight">Ledger Analytics</h3>
        <p class="text-xs text-muted">
          Realized attribution and cash movement from imported transactions.
        </p>
      </div>
    </header>

    <div
      v-if="analytics.warnings.length"
      class="mx-4 mt-4 rounded-lg border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-3 py-2 text-xs text-muted"
    >
      <div class="flex items-center gap-2 text-[var(--tape-warn)] font-medium">
        <IconTriangleAlert class="size-3.5" />
        Incomplete cost basis detected
      </div>
      <div class="mt-1 max-h-16 overflow-y-auto space-y-0.5">
        <div v-for="warning in analytics.warnings.slice(0, 4)" :key="warning">
          {{ warning }}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-7 gap-2 p-4 border-b border-[var(--tape-border)]">
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
          <IconActivity class="size-3" /> Trading
        </div>
        <div class="text-mono text-lg font-semibold mt-0.5" :class="tone(analytics.totals.realizedTradingPnl)">
          {{ formatChange(analytics.totals.realizedTradingPnl) }}
        </div>
      </div>
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
          <IconBadgeDollarSign class="size-3" /> Dividends
        </div>
        <div class="text-mono text-lg font-semibold mt-0.5 text-[var(--tape-up)]">
          {{ formatChange(analytics.totals.dividends) }}
        </div>
      </div>
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
          <IconCircleDollarSign class="size-3" /> Interest
        </div>
        <div class="text-mono text-lg font-semibold mt-0.5 text-[var(--tape-up)]">
          {{ formatChange(analytics.totals.interest) }}
        </div>
      </div>
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
          <IconReceiptText class="size-3" /> Fees
        </div>
        <div class="text-mono text-lg font-semibold mt-0.5 text-[var(--tape-down)]">
          {{ formatChange(-analytics.totals.fees) }}
        </div>
      </div>
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft">Net Realized</div>
        <div class="text-mono text-lg font-semibold mt-0.5" :class="tone(analytics.totals.netRealized)">
          {{ formatChange(analytics.totals.netRealized) }}
        </div>
      </div>
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
          <IconArrowDownToLine class="size-3" /> Deposits
        </div>
        <div class="text-mono text-lg font-semibold mt-0.5">
          {{ analytics.totals.deposits.toFixed(2) }}
        </div>
      </div>
      <div class="rounded-lg bg-[var(--tape-button-bg)] px-3 py-2">
        <div class="text-[10px] uppercase tracking-wider text-soft flex items-center gap-1.5">
          <IconArrowUpFromLine class="size-3" /> Withdrawals
        </div>
        <div class="text-mono text-lg font-semibold mt-0.5">
          {{ analytics.totals.withdrawals.toFixed(2) }}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
      <section class="overflow-x-auto border-b xl:border-b-0 xl:border-r border-[var(--tape-border)]">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[10px] uppercase tracking-wider text-soft border-b border-[var(--tape-border)]">
              <th class="text-left font-medium px-4 py-2">Symbol</th>
              <th class="text-right font-medium px-3 py-2">Trading</th>
              <th class="text-right font-medium px-3 py-2">Dividends</th>
              <th class="text-right font-medium px-3 py-2">Fees</th>
              <th class="text-right font-medium px-3 py-2">Net</th>
              <th class="text-right font-medium px-3 py-2">Open</th>
              <th class="text-right font-medium px-3 py-2">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!topAttribution.length">
              <td colspan="7" class="px-4 py-8 text-center text-sm text-soft">
                No realized attribution yet.
              </td>
            </tr>
            <tr
              v-for="row in topAttribution"
              :key="row.code"
              class="border-b border-[var(--tape-border)] last:border-b-0"
            >
              <td class="px-4 py-3">
                <div class="font-medium">{{ row.symbol }}</div>
                <div class="text-[10px] text-soft">{{ row.code }}</div>
              </td>
              <td class="px-3 py-3 text-right text-mono" :class="tone(row.realizedTradingPnl)">
                {{ formatChange(row.realizedTradingPnl) }}
              </td>
              <td class="px-3 py-3 text-right text-mono text-[var(--tape-up)]">
                {{ formatChange(row.dividends) }}
              </td>
              <td class="px-3 py-3 text-right text-mono text-[var(--tape-down)]">
                {{ formatChange(-row.fees) }}
              </td>
              <td class="px-3 py-3 text-right text-mono font-medium" :class="tone(row.netRealized)">
                {{ formatChange(row.netRealized) }}
              </td>
              <td class="px-3 py-3 text-right text-mono text-soft">
                {{ row.openShares || '--' }}
              </td>
              <td class="px-3 py-3 text-right text-mono" :class="tone(row.contributionPct)">
                {{ formatPercent(row.contributionPct) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="p-4 space-y-3">
        <div class="flex-between gap-3">
          <div>
            <h4 class="text-sm font-semibold tracking-tight">Monthly Cashflow</h4>
            <p class="text-xs text-muted">Last 12 ledger months.</p>
          </div>
          <span class="pill-flat text-[10px]">
            Net external {{ formatChange(analytics.totals.netExternal) }}
          </span>
        </div>

        <div v-if="!recentCashflow.length" class="py-10 text-center text-sm text-soft">
          No cashflow rows yet.
        </div>
        <div v-else class="space-y-2.5">
          <div
            v-for="row in recentCashflow"
            :key="row.month"
            class="grid grid-cols-[4.5rem_minmax(0,1fr)_5rem] items-center gap-2 text-xs"
          >
            <div class="text-mono text-soft">{{ row.month }}</div>
            <div class="h-2 rounded-full bg-[var(--tape-button-bg)] overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="row.netInvestmentCash >= 0 ? 'bg-[var(--tape-up)]' : 'bg-[var(--tape-down)]'"
                :style="{ width: widthPct(row.netInvestmentCash) }"
              />
            </div>
            <div class="text-right text-mono" :class="tone(row.netInvestmentCash)">
              {{ formatChange(row.netInvestmentCash, 0) }}
            </div>
          </div>
        </div>
      </section>
    </div>
  </article>
</template>
