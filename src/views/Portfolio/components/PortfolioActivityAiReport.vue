<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconBrainCircuit from '~icons/lucide/brain-circuit'
import IconCalendarDays from '~icons/lucide/calendar-days'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconShieldCheck from '~icons/lucide/shield-check'
import IconTarget from '~icons/lucide/target'
import IconUserRoundSearch from '~icons/lucide/user-round-search'
import { storeToRefs } from 'pinia'
import { aiChat, aiChatStream } from '@/api/ai'
import { useAiStore } from '@/stores/ai'
import { formatChange, formatPercent } from '@/utils/format'
import type { PortfolioAnalytics } from '@/utils/portfolioAnalytics'
import type { PortfolioRow, PortfolioSummary, PortfolioTransactionRow } from '../types'

type ReportMode = 'monthly' | 'symbol' | 'behavior'

const props = defineProps<{
  rows: PortfolioRow[]
  summary: PortfolioSummary
  transactions: PortfolioTransactionRow[]
  analytics: PortfolioAnalytics
}>()

const ai = useAiStore()
const { providersLoading, hasConfiguredProvider } = storeToRefs(ai)

const mode = ref<ReportMode>('monthly')
const selectedMonth = ref('')
const selectedCode = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const content = ref('')
const loadingHintIndex = ref(0)

let hintTimer: number | null = null

const loadingHints = [
  'Summarizing imported activity',
  'Separating cashflow from return',
  'Reviewing repeated behavior',
  'Drafting the report',
]

const modeOptions: { id: ReportMode; label: string; icon: unknown }[] = [
  { id: 'monthly', label: 'Monthly', icon: IconCalendarDays },
  { id: 'symbol', label: 'Symbol', icon: IconTarget },
  { id: 'behavior', label: 'Behavior', icon: IconUserRoundSearch },
]

const availableMonths = computed(() =>
  [...new Set(props.transactions.map((tx) => tx.date.slice(0, 7)).filter(Boolean))].sort().reverse(),
)

const availableSymbols = computed(() => {
  const codes = new Set<string>()
  for (const tx of props.transactions) {
    if (tx.code) codes.add(tx.code)
  }
  return [...codes]
    .map((code) => {
      const row = props.rows.find((r) => r.code === code)
      const attr = props.analytics.attribution.find((r) => r.code === code)
      return {
        code,
        symbol: row?.symbol || attr?.symbol || code.split('.').pop() || code,
      }
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
})

const loadingHint = computed(() => loadingHints[loadingHintIndex.value])

const selectedMonthTransactions = computed(() => {
  const month = selectedMonth.value || availableMonths.value[0] || ''
  return props.transactions.filter((tx) => tx.date.startsWith(month))
})

const selectedSymbolTransactions = computed(() => {
  const code = selectedCode.value || availableSymbols.value[0]?.code || ''
  return props.transactions.filter((tx) => tx.code === code)
})

const canGenerate = computed(() => {
  if (!hasConfiguredProvider.value || loading.value) return false
  if (mode.value === 'monthly') return Boolean(selectedMonth.value || availableMonths.value.length)
  if (mode.value === 'symbol') return Boolean(selectedCode.value || availableSymbols.value.length)
  return props.transactions.length > 0
})

function sanitize(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stopHintTimer(): void {
  if (hintTimer) window.clearInterval(hintTimer)
  hintTimer = null
}

function startHintTimer(): void {
  stopHintTimer()
  loadingHintIndex.value = 0
  hintTimer = window.setInterval(() => {
    loadingHintIndex.value = (loadingHintIndex.value + 1) % loadingHints.length
  }, 1400)
}

function txCash(tx: PortfolioTransactionRow): number {
  if (tx.type === 'buy') return -(tx.shares * tx.price + tx.fee)
  if (tx.type === 'sell') return tx.shares * tx.price - tx.fee
  if (tx.type === 'dividend' || tx.type === 'interest' || tx.type === 'deposit') return tx.amount ?? 0
  if (tx.type === 'fee' || tx.type === 'withdrawal') return -(tx.amount ?? tx.fee)
  return 0
}

function compactTx(tx: PortfolioTransactionRow): string {
  return [
    tx.date,
    tx.type,
    tx.code || 'CASH',
    tx.symbol,
    tx.shares ? `shares=${tx.shares}` : '',
    tx.price ? `price=${tx.price}` : '',
    tx.fee ? `fee=${tx.fee}` : '',
    tx.amount ? `amount=${tx.amount}` : '',
    `cash=${formatChange(txCash(tx))}`,
  ]
    .filter(Boolean)
    .join(' ')
}

function buildMonthlyPrompt(): string {
  const month = selectedMonth.value || availableMonths.value[0] || 'unknown'
  const cashflow = props.analytics.cashflow.find((row) => row.month === month)
  const txs = selectedMonthTransactions.value.slice(0, 80).map(compactTx)
  const activeSymbols = [...new Set(selectedMonthTransactions.value.map((tx) => tx.code).filter(Boolean))]
  const related = props.analytics.attribution
    .filter((row) => activeSymbols.includes(row.code))
    .slice(0, 12)
    .map((row) => `${row.symbol} ${row.code}: trading ${formatChange(row.realizedTradingPnl)}, dividends ${formatChange(row.dividends)}, fees ${formatChange(-row.fees)}, net ${formatChange(row.netRealized)}, openShares ${row.openShares}`)
  return [
    `Report type: monthly activity review.`,
    `Month: ${month}.`,
    `Portfolio summary now: value ${props.summary.value.toFixed(2)}, cost ${props.summary.cost.toFixed(2)}, unrealized ${formatChange(props.summary.unrealizedPnl)}, realized ${formatChange(props.summary.realizedPnl)}, total return ${formatPercent(props.summary.totalReturnPct)}.`,
    `Month cashflow: deposits ${cashflow?.deposits ?? 0}, withdrawals ${cashflow?.withdrawals ?? 0}, dividends ${cashflow?.dividends ?? 0}, interest ${cashflow?.interest ?? 0}, fees ${cashflow?.fees ?? 0}, trading cash ${cashflow?.tradingCash ?? 0}, net external ${cashflow?.netExternal ?? 0}, net investment cash ${cashflow?.netInvestmentCash ?? 0}.`,
    `Related symbol attribution:\n${related.length ? related.join('\n') : 'No symbol attribution for this month.'}`,
    `Data quality notes:\n${props.analytics.warnings.filter((w) => w.includes(month)).slice(0, 8).join('\n') || 'No unmatched sell warnings for this month.'}`,
    `Transactions, capped at 80 rows:\n${txs.length ? txs.join('\n') : 'No transactions in this month.'}`,
  ].join('\n\n')
}

function buildSymbolPrompt(): string {
  const code = selectedCode.value || availableSymbols.value[0]?.code || ''
  const row = props.rows.find((r) => r.code === code)
  const attr = props.analytics.attribution.find((r) => r.code === code)
  const txs = selectedSymbolTransactions.value.slice(0, 120).map(compactTx)
  return [
    `Report type: single-symbol trade review.`,
    `Symbol: ${attr?.symbol || row?.symbol || code}, code ${code}.`,
    row
      ? `Open position: shares ${row.shares}, avg cost ${row.avgCost.toFixed(2)}, last ${row.last.toFixed(2)}, weight ${(row.weight * 100).toFixed(1)}%, unrealized ${formatChange(row.unrealizedPnl)} (${formatPercent(row.pnlPct)}), realized ${formatChange(row.realizedPnl)}.`
      : `Open position: none.`,
    attr
      ? `Ledger attribution: buys ${attr.buys}, sells ${attr.sells}, buy notional ${attr.buyNotional.toFixed(2)}, sell notional ${attr.sellNotional.toFixed(2)}, trading ${formatChange(attr.realizedTradingPnl)}, dividends ${formatChange(attr.dividends)}, fees ${formatChange(-attr.fees)}, net ${formatChange(attr.netRealized)}, remaining cost ${attr.remainingCost.toFixed(2)}.`
      : `Ledger attribution: none.`,
    `Data quality notes:\n${props.analytics.warnings.filter((w) => w.includes(code)).slice(0, 8).join('\n') || 'No unmatched sell warnings for this symbol.'}`,
    `Transactions, capped at 120 rows:\n${txs.length ? txs.join('\n') : 'No transactions for this symbol.'}`,
  ].join('\n\n')
}

function buildBehaviorPrompt(): string {
  const symbols = props.analytics.attribution.slice(0, 20).map((row) =>
    `${row.symbol} ${row.code}: net ${formatChange(row.netRealized)}, trading ${formatChange(row.realizedTradingPnl)}, dividends ${formatChange(row.dividends)}, fees ${formatChange(-row.fees)}, buys ${row.buys}, sells ${row.sells}, open ${row.openShares}`,
  )
  const recent = props.transactions.slice(0, 80).map(compactTx)
  return [
    `Report type: portfolio behavior review.`,
    `Portfolio summary now: value ${props.summary.value.toFixed(2)}, cost ${props.summary.cost.toFixed(2)}, unrealized ${formatChange(props.summary.unrealizedPnl)}, realized ${formatChange(props.summary.realizedPnl)}, total return ${formatPercent(props.summary.totalReturnPct)}.`,
    `Totals: trading ${formatChange(props.analytics.totals.realizedTradingPnl)}, dividends ${formatChange(props.analytics.totals.dividends)}, interest ${formatChange(props.analytics.totals.interest)}, fees ${formatChange(-props.analytics.totals.fees)}, net realized ${formatChange(props.analytics.totals.netRealized)}, deposits ${props.analytics.totals.deposits}, withdrawals ${props.analytics.totals.withdrawals}, net external ${props.analytics.totals.netExternal}.`,
    `Symbol attribution, top 20 by absolute net realized:\n${symbols.length ? symbols.join('\n') : 'No attribution yet.'}`,
    `Data quality notes:\n${props.analytics.warnings.length ? props.analytics.warnings.slice(0, 12).join('\n') : 'No unmatched sell warnings.'}`,
    `Recent transactions, capped at 80 rows:\n${recent.length ? recent.join('\n') : 'No transactions yet.'}`,
  ].join('\n\n')
}

function buildPrompt(): string {
  if (mode.value === 'monthly') return buildMonthlyPrompt()
  if (mode.value === 'symbol') return buildSymbolPrompt()
  return buildBehaviorPrompt()
}

function reportTitle(): string {
  if (mode.value === 'monthly') return `Monthly report ${selectedMonth.value || availableMonths.value[0] || ''}`
  if (mode.value === 'symbol') {
    const code = selectedCode.value || availableSymbols.value[0]?.code || ''
    return `Symbol review ${code}`
  }
  return 'Behavior review'
}

async function generate(): Promise<void> {
  if (!canGenerate.value) return
  loading.value = true
  error.value = null
  content.value = ''
  startHintTimer()
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are Tape, a US-equity portfolio review assistant. Write in concise Simplified Chinese. Use only the sanitized ledger summary provided by the user. Do not infer personal identity, account details, or hidden holdings. Do not give personalized buy/sell orders. Focus on review, attribution, behavioral patterns, risk controls, and concrete next questions. Plain text only, no markdown symbols. Structure: 1) headline, 2) what drove results, 3) behavior pattern, 4) risk or blind spots, 5) next review checklist.',
    },
    { role: 'user' as const, content: buildPrompt() },
  ]
  let streamed = false
  let raw = ''
  try {
    await aiChatStream(
      { temperature: 0.25, maxTokens: 1600, messages },
      {
        onDelta(delta) {
          streamed = true
          raw += delta
          content.value = sanitize(raw)
        },
        onFinish() {
          content.value = sanitize(raw)
        },
      },
    )
  } catch (e) {
    if (streamed) {
      error.value = (e as Error).message
    } else {
      try {
        const res = await aiChat({ temperature: 0.25, maxTokens: 1600, messages })
        content.value = sanitize(res.content)
      } catch (fallbackError) {
        error.value = (fallbackError as Error).message
      }
    }
  } finally {
    loading.value = false
    stopHintTimer()
  }
}

watch(availableMonths, (months) => {
  if (!selectedMonth.value && months[0]) selectedMonth.value = months[0]
}, { immediate: true })

watch(availableSymbols, (symbols) => {
  if (!selectedCode.value && symbols[0]) selectedCode.value = symbols[0].code
}, { immediate: true })

onMounted(() => void ai.loadProviders())
onBeforeUnmount(() => stopHintTimer())
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconBrainCircuit class="size-4 text-[var(--tape-info)]" />
        <div>
          <h3 class="font-semibold tracking-tight">AI Activity Reports</h3>
          <p class="text-xs text-muted mt-0.5">
            Monthly report, symbol review, and behavior readout from the local ledger.
          </p>
        </div>
      </div>
      <button
        class="btn-primary h-8 px-3 text-xs"
        :disabled="!canGenerate || providersLoading"
        @click="generate"
      >
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-pulse opacity-80'" />
        Generate
      </button>
    </header>

    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="item in modeOptions"
        :key="item.id"
        class="h-8 px-3 rounded-lg border text-xs flex items-center gap-1.5 transition-colors"
        :class="mode === item.id ? 'border-[var(--tape-border-hover)] bg-[var(--tape-surface-hover-bg)] text-[var(--tape-text)]' : 'border-[var(--tape-border)] bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)]'"
        @click="mode = item.id"
      >
        <component :is="item.icon" class="size-3.5" />
        {{ item.label }}
      </button>

      <select
        v-if="mode === 'monthly'"
        v-model="selectedMonth"
        class="h-8 rounded-lg border border-[var(--tape-border)] bg-[var(--tape-input)] px-2 text-xs text-[var(--tape-text)]"
      >
        <option v-for="month in availableMonths" :key="month" :value="month">{{ month }}</option>
      </select>

      <select
        v-if="mode === 'symbol'"
        v-model="selectedCode"
        class="h-8 rounded-lg border border-[var(--tape-border)] bg-[var(--tape-input)] px-2 text-xs text-[var(--tape-text)]"
      >
        <option v-for="item in availableSymbols" :key="item.code" :value="item.code">
          {{ item.symbol }} - {{ item.code }}
        </option>
      </select>

      <span class="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-soft">
        <IconShieldCheck class="size-3.5 text-[var(--tape-accent)]" />
        Redacted summary only
      </span>
    </div>

    <p v-if="!hasConfiguredProvider && !providersLoading" class="text-xs text-soft">
      Configure an AI provider in the bridge environment to generate reports.
    </p>
    <p v-else-if="error" class="text-xs text-[var(--tape-down)]">{{ error }}</p>

    <div v-else-if="content" class="space-y-3">
      <div class="text-[10px] uppercase tracking-wider text-soft">
        {{ reportTitle() }}
      </div>
      <div class="text-sm leading-6 whitespace-pre-line break-words">
        {{ content }}<span v-if="loading" class="animate-pulse text-[var(--tape-info)]">|</span>
      </div>
    </div>

    <div v-else-if="loading" class="space-y-3">
      <div class="flex items-center gap-2 text-xs text-soft">
        <IconBrainCircuit class="size-3.5 animate-pulse opacity-80 text-[var(--tape-info)]" />
        {{ loadingHint }}
      </div>
      <div class="space-y-2">
        <div class="h-3 skeleton rounded-full w-5/6" />
        <div class="h-3 skeleton rounded-full w-3/4" />
        <div class="h-3 skeleton rounded-full w-4/5" />
      </div>
    </div>

    <p v-else class="text-xs text-soft">
      Pick a report mode and generate after importing or editing ledger transactions.
    </p>
  </article>
</template>
