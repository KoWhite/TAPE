<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { usePortfolioStore } from '@/stores/portfolio'
import { usePortfolioHistoryStore } from '@/stores/portfolioHistory'
import { useQuotesStore } from '@/stores/quotes'
import { useQuotes } from '@/composables/useQuotes'
import { formatRelative } from '@/utils/format'
import { analyzePortfolio } from '@/utils/portfolioAnalytics'
import { getQuoteValuation } from '@/utils/quoteValuation'
import PortfolioHistoryChart from '@/components/portfolio/PortfolioHistoryChart.vue'
import PortfolioClosedPositions from './components/PortfolioClosedPositions.vue'
import PortfolioAiDiagnosis from './components/PortfolioAiDiagnosis.vue'
import PortfolioActivityAiReport from './components/PortfolioActivityAiReport.vue'
import PortfolioBreakdown from './components/PortfolioBreakdown.vue'
import PortfolioHeader from './components/PortfolioHeader.vue'
import PortfolioIbkrImport from './components/PortfolioIbkrImport.vue'
import PortfolioLedgerAnalytics from './components/PortfolioLedgerAnalytics.vue'
import PortfolioPlanModal from './components/PortfolioPlanModal.vue'
import PortfolioPositionsTable from './components/PortfolioPositionsTable.vue'
import PortfolioRebalanceCard from './components/PortfolioRebalanceCard.vue'
import PortfolioSummaryCards from './components/PortfolioSummaryCards.vue'
import PortfolioTradeModal from './components/PortfolioTradeModal.vue'
import PortfolioTransactionsPanel from './components/PortfolioTransactionsPanel.vue'
import type {
  PortfolioPlanEditing,
  PortfolioRow,
  PortfolioSummary,
  PortfolioTradeEditing,
} from './types'

const portfolio = usePortfolioStore()
portfolio.ensureMigrated()
const { positions, transactions, closedPositions } = storeToRefs(portfolio)

const history = usePortfolioHistoryStore()
const { snapshots } = storeToRefs(history)

const { refresh: refreshQuotes, loading: quotesLoading, lastSync } = useQuotes()
const quotesStore = useQuotesStore()
const { quotes } = storeToRefs(quotesStore)

const router = useRouter()

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const rows = computed<PortfolioRow[]>(() => {
  const tmp = positions.value.map((p) => {
    const q = quotes.value.get(p.code)
    const valuation = getQuoteValuation(q)
    const last = valuation?.price ?? 0
    const cost = p.costBasis ?? p.shares * p.avgCost
    const value = p.shares * last
    const dayChange = valuation ? p.shares * valuation.change : 0
    const prevValue = valuation?.changePct ? value / (1 + valuation.changePct) : q ? p.shares * q.prevClose : 0
    const unrealizedPnl = value - cost
    const realizedPnl = p.realizedPnl + p.dividends
    const plan = portfolio.planFor(p.code)
    return {
      code: p.code,
      symbol: p.symbol,
      shares: p.shares,
      avgCost: p.avgCost,
      cost,
      realizedPnl,
      unrealizedPnl,
      totalPnl: realizedPnl + unrealizedPnl,
      dividends: p.dividends,
      last,
      value,
      pnl: unrealizedPnl,
      pnlPct: cost ? unrealizedPnl / cost : 0,
      dayChange,
      dayChangePct: prevValue ? dayChange / prevValue : 0,
      hasQuote: Boolean(valuation),
      takeProfitPrice: plan?.takeProfitPrice,
      stopLossPrice: plan?.stopLossPrice,
      targetWeight: plan?.targetWeight,
    }
  })
  const totalValue = tmp.reduce((s, r) => s + r.value, 0)
  return tmp.map((r) => ({ ...r, weight: totalValue ? r.value / totalValue : 0 }))
})

const realizedPnl = computed(() => {
  const open = positions.value.reduce((s, p) => s + p.realizedPnl + p.dividends, 0)
  const closed = closedPositions.value.reduce((s, p) => s + p.realizedPnl, 0)
  const accountCash = transactions.value.reduce((sum, tx) => {
    if (tx.code) return sum
    if (tx.type === 'interest') return sum + (tx.amount ?? 0)
    if (tx.type === 'fee') return sum - (tx.amount ?? tx.fee)
    return sum
  }, 0)
  return open + closed + accountCash
})

const summary = computed<PortfolioSummary>(() => {
  const cost = rows.value.reduce((s, r) => s + r.cost, 0)
  const value = rows.value.reduce((s, r) => s + r.value, 0)
  const unrealizedPnl = value - cost
  const totalPnl = unrealizedPnl + realizedPnl.value
  const dayChange = rows.value.reduce((s, r) => s + r.dayChange, 0)
  const prevValue = rows.value.reduce((s, r) => s + (r.hasQuote ? r.value - r.dayChange : 0), 0)
  const capitalBase = cost + Math.max(0, realizedPnl.value)
  return {
    cost,
    value,
    unrealizedPnl,
    realizedPnl: realizedPnl.value,
    totalPnl,
    totalReturnPct: capitalBase ? totalPnl / capitalBase : 0,
    dayChange,
    dayChangePct: prevValue ? dayChange / prevValue : 0,
    pricedCount: rows.value.filter((r) => r.hasQuote).length,
  }
})

const transactionRows = computed(() =>
  [...transactions.value].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
)

const ledgerAnalytics = computed(() => analyzePortfolio(transactions.value))

const lastSyncLabel = computed(() => {
  return lastSync.value ? formatRelative(lastSync.value.toISOString()) : null
})

const tradeEditing = ref<PortfolioTradeEditing | null>(null)
const planEditing = ref<PortfolioPlanEditing | null>(null)
const tradeError = ref<string | null>(null)
const pendingRemoveTransactionId = ref<string | null>(null)

const maxTradeShares = computed(() => {
  const e = tradeEditing.value
  if (!e || e.mode === 'buy') return undefined
  return portfolio.find(e.code)?.shares
})

function makeTrade(mode: PortfolioTradeEditing['mode'], code = ''): PortfolioTradeEditing {
  const p = code ? portfolio.find(code) : undefined
  const q = code ? quotes.value.get(code) : undefined
  return {
    mode,
    code: p?.code ?? code,
    symbol: p?.symbol ?? (code.split('.').pop() || ''),
    shares: mode === 'close' && p ? String(p.shares) : '',
    price: q?.last ? q.last.toFixed(2) : '',
    fee: '0',
    date: todayLocal(),
    reason: mode === 'buy' ? 'manual' : 'manual',
    note: '',
  }
}

function startAdd(): void {
  tradeError.value = null
  tradeEditing.value = makeTrade('buy')
}

function startBuy(code: string): void {
  tradeError.value = null
  tradeEditing.value = makeTrade('buy', code)
}

function startSell(code: string): void {
  tradeError.value = null
  tradeEditing.value = makeTrade('sell', code)
}

function startClose(code: string): void {
  tradeError.value = null
  tradeEditing.value = makeTrade('close', code)
}

/** Pre-fill the trade modal from a rebalance suggestion. Same shape as
 *  startBuy/startSell, but seeds the share count instead of leaving it blank. */
function startRebalanceTrade(payload: { code: string; symbol: string; mode: 'buy' | 'sell'; shares: number }): void {
  tradeError.value = null
  const seed = makeTrade(payload.mode, payload.code)
  seed.shares = String(payload.shares)
  if (payload.symbol) seed.symbol = payload.symbol
  tradeEditing.value = seed
}

function saveTrade(): void {
  const e = tradeEditing.value
  if (!e) return
  const code = e.code.trim().toUpperCase()
  const symbol = (e.symbol || code.split('.').pop() || '').trim().toUpperCase()
  const shares = Number(e.shares)
  const price = Number(e.price)
  const fee = Number(e.fee || 0)
  tradeError.value = null
  if (!code.includes('.')) {
    tradeError.value = 'Use a Futu-style code such as US.AAPL.'
    return
  }
  if (!symbol) {
    tradeError.value = 'Symbol is required.'
    return
  }
  if (!Number.isFinite(price) || price <= 0) {
    tradeError.value = 'Price must be greater than 0.'
    return
  }
  if (!Number.isFinite(fee) || fee < 0) {
    tradeError.value = 'Fee cannot be negative.'
    return
  }
  if (e.mode === 'buy') {
    if (!Number.isFinite(shares) || shares <= 0) {
      tradeError.value = 'Shares must be greater than 0.'
      return
    }
    portfolio.buy({ code, symbol, shares, price, fee, date: e.date, note: e.note.trim() || undefined })
  } else if (e.mode === 'sell') {
    if (!Number.isFinite(shares) || shares <= 0) {
      tradeError.value = 'Shares must be greater than 0.'
      return
    }
    const saved = portfolio.sell({ code, symbol, shares, price, fee, date: e.date, reason: e.reason, note: e.note.trim() || undefined })
    if (!saved) {
      tradeError.value = 'Sell shares cannot exceed the current open position.'
      return
    }
  } else {
    const saved = portfolio.closePosition({ code, symbol, price, fee, date: e.date, reason: e.reason, note: e.note.trim() || undefined })
    if (!saved) {
      tradeError.value = 'No open position found to close.'
      return
    }
  }
  tradeEditing.value = null
}

function startPlan(code: string): void {
  const p = portfolio.find(code)
  if (!p) return
  const plan = portfolio.planFor(code)
  planEditing.value = {
    code,
    symbol: p.symbol,
    takeProfitPrice: plan?.takeProfitPrice ? String(plan.takeProfitPrice) : '',
    stopLossPrice: plan?.stopLossPrice ? String(plan.stopLossPrice) : '',
    targetWeight: plan?.targetWeight ? String(plan.targetWeight * 100) : '',
    enabled: plan?.enabled ?? true,
    note: plan?.note ?? '',
  }
}

function savePlan(): void {
  const e = planEditing.value
  if (!e) return
  const takeProfitPrice = Number(e.takeProfitPrice)
  const stopLossPrice = Number(e.stopLossPrice)
  const targetWeight = Number(e.targetWeight)
  portfolio.saveExitPlan({
    code: e.code,
    takeProfitPrice: Number.isFinite(takeProfitPrice) && takeProfitPrice > 0 ? takeProfitPrice : undefined,
    stopLossPrice: Number.isFinite(stopLossPrice) && stopLossPrice > 0 ? stopLossPrice : undefined,
    targetWeight: Number.isFinite(targetWeight) && targetWeight > 0 ? targetWeight / 100 : undefined,
    enabled: e.enabled,
    note: e.note.trim() || undefined,
  })
  planEditing.value = null
}

function clearPlan(code: string): void {
  portfolio.clearExitPlan(code)
  planEditing.value = null
}

function requestRemoveTransaction(id: string): void {
  pendingRemoveTransactionId.value = id
}

function confirmRemoveTransaction(id: string): void {
  portfolio.removeTransaction(id)
  if (pendingRemoveTransactionId.value === id) pendingRemoveTransactionId.value = null
}

function openDetail(code: string): void {
  router.push(`/stock/${encodeURIComponent(code)}`)
}
</script>

<template>
  <div class="space-y-6">
    <PortfolioHeader
      :positions-count="positions.length"
      :loading="quotesLoading"
      :last-sync-label="lastSyncLabel"
      @refresh="refreshQuotes"
      @add="startAdd"
    />
    <PortfolioSummaryCards :summary="summary" :positions-count="positions.length" />
    <PortfolioIbkrImport />
    <PortfolioBreakdown :rows="rows" />
    <PortfolioLedgerAnalytics :analytics="ledgerAnalytics" />
    <PortfolioRebalanceCard
      :rows="rows"
      :total-value="summary.value"
      @trade="startRebalanceTrade"
    />
    <PortfolioActivityAiReport
      :rows="rows"
      :summary="summary"
      :transactions="transactionRows"
      :analytics="ledgerAnalytics"
    />
    <PortfolioAiDiagnosis
      :rows="rows"
      :summary="summary"
      :transactions="transactionRows"
    />
    <PortfolioHistoryChart v-if="positions.length || closedPositions.length" :snapshots="snapshots" />
    <PortfolioPositionsTable
      :rows="rows"
      @open="openDetail"
      @buy="startBuy"
      @sell="startSell"
      @close="startClose"
      @plan="startPlan"
    />
    <PortfolioClosedPositions :positions="closedPositions" />
    <PortfolioTransactionsPanel
      :transactions="transactionRows"
      :pending-remove-id="pendingRemoveTransactionId"
      @request-remove="requestRemoveTransaction"
      @cancel-remove="pendingRemoveTransactionId = null"
      @confirm-remove="confirmRemoveTransaction"
    />
    <PortfolioTradeModal
      v-model="tradeEditing"
      :max-shares="maxTradeShares"
      :error="tradeError"
      @save="saveTrade"
    />
    <PortfolioPlanModal
      v-model="planEditing"
      @save="savePlan"
      @clear="clearPlan"
    />
  </div>
</template>
