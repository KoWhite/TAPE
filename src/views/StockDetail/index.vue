<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAlertsStore } from '@/stores/alerts'
import { useEarningsStore } from '@/stores/earnings'
import { useIndicatorsStore } from '@/stores/indicators'
import { useInstitutionalStore } from '@/stores/institutional'
import { usePortfolioStore } from '@/stores/portfolio'
import { getProvider } from '@/api'
import { fetchKline } from '@/api/kline'
import type { Quote } from '@/types/stock'
import type { KlineBar } from '@/types/kline'
import type { KlineTradeMarker } from '@/components/kline/KlineChart.vue'
import AnalystRibbon from './components/AnalystRibbon.vue'
import { useNewsStore } from '@/stores/news'
import StockAlertModal from './components/StockAlertModal.vue'
import StockAlertsPills from './components/StockAlertsPills.vue'
import StockAiActionsCard from './components/StockAiActionsCard.vue'
import StockAiAnalysisCard from './components/StockAiAnalysisCard.vue'
import StockChartControls from './components/StockChartControls.vue'
import StockDetailHeader from './components/StockDetailHeader.vue'
import StockEarningsPanel from './components/StockEarningsPanel.vue'
import StockErrorBanner from './components/StockErrorBanner.vue'
import StockKlinePanel from './components/StockKlinePanel.vue'
import StockNewsPanel from './components/StockNewsPanel.vue'
import StockQuoteCard from './components/StockQuoteCard.vue'
import type { StockAlertForm, StockIndicators, StockPeriod } from './types'

const route = useRoute()
const router = useRouter()
const alerts = useAlertsStore()
const earnings = useEarningsStore()
const institutional = useInstitutionalStore()
const portfolio = usePortfolioStore()
const news = useNewsStore()

const code = computed(() => decodeURIComponent(String(route.params.code || '')))
const codeAlerts = computed(() => alerts.rulesFor(code.value))
const earningsRecord = computed(() => earnings.get(code.value))
const earningsLoading = computed(() => earnings.loadingFor(code.value))
const earningsReady = computed(
  () => earnings.hasCompleted(code.value) && !earningsLoading.value,
)
const institutionalContext = computed(() => institutional.get(code.value))
const institutionalLoading = computed(() => institutional.loadingFor(code.value))
const institutionalReady = computed(
  () => institutional.hasCompleted(code.value) && !institutionalLoading.value,
)

const PERIODS: StockPeriod[] = [
  { id: 'K_1M', label: '1m', intraday: true, count: 240 },
  { id: 'K_5M', label: '5m', intraday: true, count: 240 },
  { id: 'K_15M', label: '15m', intraday: true, count: 240 },
  { id: 'K_60M', label: '1H', intraday: true, count: 240 },
  { id: 'K_DAY', label: 'D', intraday: false, count: 250 },
  { id: 'K_WEEK', label: 'W', intraday: false, count: 250 },
  { id: 'K_MON', label: 'M', intraday: false, count: 120 },
]

const period = ref<StockPeriod>(PERIODS[4])
const indicators = ref<StockIndicators>({ boll: false, rsi: false, macd: false })

// Backend-computed overlay indicators (SMA/EMA/WMA/VWAP/etc). Drawn on the
// price pane on top of MA5/10/20 and BOLL. Each entry uses default params
// from the catalog — parameter tuning happens in /indicators.
const indicatorsStore = useIndicatorsStore()
const activeOverlays = ref<Set<string>>(new Set())

const overlayCatalog = computed(() =>
  indicatorsStore.catalog.filter(
    (m) => m.pane === 'overlay' && m.id !== 'bbands',
  ),
)

function toggleOverlay(id: string): void {
  const next = new Set(activeOverlays.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  activeOverlays.value = next
}

function paramsFor(id: string): Record<string, number> {
  const meta = indicatorsStore.meta(id)
  if (!meta) return {}
  const out: Record<string, number> = {}
  for (const p of meta.params) out[p.name] = p.default
  return out
}

/** Resolve active overlays to a flat list of KlineOverlay payloads, one
 *  entry per output series. Lazy — only triggers compute requests for
 *  what the user actually toggled on. */
const klineOverlays = computed(() => {
  const out: { key: string; label: string; points: { time: number | string; value: number | null }[] }[] = []
  for (const id of activeOverlays.value) {
    const meta = indicatorsStore.meta(id)
    if (!meta) continue
    const req = {
      code: code.value,
      ktype: period.value.id,
      count: period.value.count,
      indicator: id,
      params: paramsFor(id),
    }
    const result = indicatorsStore.get(req)
    if (!result) continue
    for (const series of result.series) {
      out.push({
        key: `${id}:${series.name}`,
        label: meta.outputs.length > 1 ? `${meta.id.toUpperCase()} ${series.name}` : meta.id.toUpperCase(),
        points: series.points,
      })
    }
  }
  return out
})

watch(
  [activeOverlays, code, () => period.value.id],
  () => {
    if (!code.value) return
    for (const id of activeOverlays.value) {
      void indicatorsStore.ensure({
        code: code.value,
        ktype: period.value.id,
        count: period.value.count,
        indicator: id,
        params: paramsFor(id),
      })
    }
  },
  { deep: true },
)

const quote = ref<Quote | null>(null)
const bars = ref<KlineBar[]>([])
const loadingQuote = ref(false)
const loadingKline = ref(false)
const errorQuote = ref<string | null>(null)
const errorKline = ref<string | null>(null)

interface EtClock {
  year: number
  month: number
  day: number
  minutes: number
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value && Number.isFinite(value) && value > 0 ? value : fallback
}

function etClock(now = new Date()): EtClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const hour = pick('hour') % 24
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    minutes: hour * 60 + pick('minute'),
  }
}

function isoFromUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function previousWeekdayIso(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  do {
    d.setUTCDate(d.getUTCDate() - 1)
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  return isoFromUtcDate(d)
}

function latestRegularSessionDate(): string {
  const et = etClock()
  const today = isoFromUtcDate(new Date(Date.UTC(et.year, et.month - 1, et.day)))
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const isWeekend = weekday === 0 || weekday === 6
  if (isWeekend) return previousWeekdayIso(et.year, et.month, et.day)

  // Before 09:30 ET, the latest completed regular-hours candle is the
  // previous trading day. From regular-hours onward, today's candle may be
  // present or should be completed from the live quote.
  if (et.minutes < 9 * 60 + 30) return previousWeekdayIso(et.year, et.month, et.day)
  return today
}

function regularDailyBarFromQuote(time: string, q: Quote, previousClose: number): KlineBar {
  const close = positiveOr(q.last, previousClose)
  const open = positiveOr(q.open, previousClose || close)
  const high = Math.max(open, close, positiveOr(q.high, close))
  const low = Math.min(open, close, positiveOr(q.low, close))
  return {
    time,
    open,
    high,
    low,
    close,
    volume: positiveOr(q.volume, 0),
    turnover: positiveOr(q.turnover, 0),
    changeRate: previousClose ? close / previousClose - 1 : q.changePct,
  }
}

function mergeLiveDailyBar(source: KlineBar[], q: Quote): KlineBar[] {
  if (!q.last || q.last <= 0 || source.length === 0) return source
  const next = [...source]
  const last = next[next.length - 1]
  const targetDate = latestRegularSessionDate()
  const lastDate = String(last.time)
  if (lastDate < targetDate) {
    next.push(regularDailyBarFromQuote(targetDate, q, last.close || q.prevClose))
    return next
  }
  if (lastDate > targetDate) return next

  const open = positiveOr(q.open, last?.close ?? q.last)
  next[next.length - 1] = {
    ...last,
    high: Math.max(last.high, q.last, positiveOr(q.high, q.last), open),
    low: Math.min(last.low, q.last, positiveOr(q.low, q.last), open),
    close: q.last,
    volume: positiveOr(q.volume, last.volume),
    turnover: positiveOr(q.turnover, last.turnover),
    changeRate: q.changePct || last.changeRate,
  }
  return next
}

function mergeLiveIntradayBar(source: KlineBar[], q: Quote): KlineBar[] {
  if (!q.last || q.last <= 0 || source.length === 0) return source
  const next = [...source]
  const last = next[next.length - 1]
  next[next.length - 1] = {
    ...last,
    high: Math.max(last.high, q.last),
    low: Math.min(last.low, q.last),
    close: q.last,
    changeRate: last.open ? q.last / last.open - 1 : last.changeRate,
  }
  return next
}

function mergeLiveQuoteIntoBars(source: KlineBar[], q: Quote | null, p: StockPeriod): KlineBar[] {
  if (!q) return source
  if (p.id === 'K_DAY') return mergeLiveDailyBar(source, q)
  if (p.intraday) return mergeLiveIntradayBar(source, q)
  return source
}

const displayBars = computed(() => mergeLiveQuoteIntoBars(bars.value, quote.value, period.value))

function markerTimeForDate(date: string): KlineBar['time'] | null {
  if (period.value.intraday || period.value.id !== 'K_DAY') return null
  const source = displayBars.value
  if (!source.length) return null
  const exact = source.find((bar) => String(bar.time) === date)
  return exact?.time ?? null
}

const ledgerMarkers = computed<KlineTradeMarker[]>(() => {
  if (period.value.intraday) return []
  const out: KlineTradeMarker[] = []
  for (const tx of portfolio.transactions) {
    if (tx.code !== code.value || !['buy', 'sell', 'dividend', 'fee'].includes(tx.type)) continue
    const time = markerTimeForDate(tx.date)
    if (!time) continue
    const shares = tx.shares ? `${tx.shares} @ ${tx.price.toFixed(2)}` : (tx.amount ?? tx.fee).toFixed(2)
    out.push({
      id: tx.id,
      time,
      type: tx.type as KlineTradeMarker['type'],
      label: tx.type === 'buy' ? `B ${shares}` : tx.type === 'sell' ? `S ${shares}` : tx.type === 'dividend' ? `D ${shares}` : `F ${shares}`,
      price: tx.price || undefined,
    })
  }
  return out
})

/** Stale-response guard: if the user navigates from AAPL → NVDA fast,
 *  an in-flight AAPL quote response must not clobber NVDA's UI. We bump
 *  this every time the active code (or its load cycle) starts, and any
 *  response with a mismatched token gets dropped. */
let loadToken = 0

async function loadQuote(targetCode: string, token: number): Promise<void> {
  if (!targetCode) return
  loadingQuote.value = true
  errorQuote.value = null
  try {
    const provider = getProvider()
    const arr = await provider.fetchQuotes([targetCode])
    if (token !== loadToken) return
    quote.value = arr[0] ?? null
    if (!quote.value) errorQuote.value = `No quote returned for ${targetCode}`
  } catch (e) {
    if (token !== loadToken) return
    errorQuote.value = (e as Error).message
  } finally {
    if (token === loadToken) loadingQuote.value = false
  }
}

async function loadKline(targetCode: string, token: number): Promise<void> {
  if (!targetCode) return
  loadingKline.value = true
  errorKline.value = null
  try {
    const res = await fetchKline({
      code: targetCode,
      ktype: period.value.id,
      count: period.value.count,
    })
    if (token !== loadToken) return
    bars.value = res.bars
  } catch (e) {
    if (token !== loadToken) return
    errorKline.value = (e as Error).message
    bars.value = []
  } finally {
    if (token === loadToken) loadingKline.value = false
  }
}

/** Kick off every panel's data for the given code in parallel. Stores
 *  (earnings/institutional/news) already dedupe internally; quote + kline
 *  guard themselves with `loadToken` so a stale symbol can't win. */
function loadAll(c: string): void {
  if (!c) return
  const token = ++loadToken
  void Promise.allSettled([
    loadQuote(c, token),
    loadKline(c, token),
    earnings.loadMissing([c]),
    institutional.load(c),
    news.loadTicker(c),
  ])
}

function refreshAll(): void {
  loadAll(code.value)
}

onMounted(() => {
  refreshAll()
  void indicatorsStore.loadCatalog()
})
watch(code, (c) => loadAll(c))
watch(period, () => void loadKline(code.value, ++loadToken))

const tickerNews = computed(() => news.get(code.value)?.items ?? [])
const newsLoading = computed(() => news.loadingFor(code.value))
const newsReady = computed(() => news.hasCompleted(code.value) && !newsLoading.value)
const aiContextReady = computed(
  () =>
    Boolean(quote.value) &&
    !loadingQuote.value &&
    displayBars.value.length >= 30 &&
    !loadingKline.value &&
    newsReady.value &&
    earningsReady.value &&
    institutionalReady.value,
)
const aiContextLoading = computed(
  () =>
    loadingQuote.value ||
    loadingKline.value ||
    newsLoading.value ||
    earningsLoading.value ||
    institutionalLoading.value ||
    !newsReady.value ||
    !earningsReady.value ||
    !institutionalReady.value,
)

function back(): void {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function defaultBacktestStart(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

function openBacktest(): void {
  const position = portfolio.find(code.value)
  const plan = portfolio.planFor(code.value)
  const q: Record<string, string> = {
    symbol: code.value,
    strategy: 'buy_hold',
    startDate: defaultBacktestStart(),
    endDate: new Date().toISOString().slice(0, 10),
  }
  if (position?.costBasis) q.initialCapital = String(Math.max(100, Math.round(position.costBasis)))
  const exits = []
  if (plan?.takeProfitPrice) exits.push({ left: 'close', op: '>=', right: plan.takeProfitPrice })
  if (plan?.stopLossPrice) exits.push({ left: 'close', op: '<=', right: plan.stopLossPrice })
  if (exits.length) {
    q.strategy = 'dsl'
    q.dsl = JSON.stringify({
      name: 'Current exit plan',
      entry: { left: 'close', op: '>=', right: 0 },
      exit: exits.length === 1 ? exits[0] : { any: exits },
    })
  }
  router.push({ path: '/backtest', query: q })
}

const showAlertModal = ref(false)
const alertForm = ref<StockAlertForm>({
  type: 'priceAbove',
  threshold: '',
})

function openAlertModal(): void {
  const last = quote.value?.last
  alertForm.value = {
    type: 'priceAbove',
    threshold: last ? last.toFixed(2) : '',
  }
  showAlertModal.value = true
}

function toggleIndicator(indicator: keyof StockIndicators): void {
  indicators.value[indicator] = !indicators.value[indicator]
}

function saveAlert(): void {
  const threshold = Number(alertForm.value.threshold)
  if (!Number.isFinite(threshold) || threshold === 0) return
  const isPct = alertForm.value.type.startsWith('changePct')
  alerts.add({
    code: code.value,
    symbol: quote.value?.symbol || code.value.split('.').pop() || code.value,
    type: alertForm.value.type,
    threshold: isPct ? threshold / 100 : threshold,
  })
  showAlertModal.value = false
}
</script>

<template>
  <div class="space-y-4">
    <StockDetailHeader
      :quote="quote"
      :code="code"
      :alerts-count="codeAlerts.length"
      :loading="loadingQuote || loadingKline"
      @back="back"
      @alert="openAlertModal"
      @backtest="openBacktest"
      @refresh="refreshAll"
    />

    <StockQuoteCard v-if="quote" :quote="quote" />
    <StockErrorBanner v-else-if="errorQuote" :error="errorQuote" />

    <StockChartControls
      :periods="PERIODS"
      :period="period"
      :indicators="indicators"
      :overlay-catalog="overlayCatalog"
      :active-overlays="activeOverlays"
      @update:period="period = $event"
      @toggle-indicator="toggleIndicator"
      @toggle-overlay="toggleOverlay"
    />

    <AnalystRibbon :code="code" :live-price="quote?.last" />

    <StockAiAnalysisCard
      :code="code"
      :quote="quote"
      :bars="displayBars"
      :quote-loading="loadingQuote"
      :kline-loading="loadingKline"
      :news="tickerNews"
      :news-loading="newsLoading"
      :earnings="earningsRecord"
      :earnings-loading="earningsLoading"
      :institutional="institutionalContext"
      :institutional-loading="institutionalLoading"
      :context-ready="aiContextReady"
      :context-loading="aiContextLoading"
    />

    <StockAiActionsCard
      :code="code"
      :quote="quote"
      :news="tickerNews"
    />

    <StockEarningsPanel
      v-if="earningsRecord"
      :code="code"
      :record="earningsRecord"
    />

    <StockAlertsPills :alerts="codeAlerts" @remove="alerts.remove" />

    <StockKlinePanel
      :bars="displayBars"
      :intraday="period.intraday"
      :indicators="indicators"
      :overlays="klineOverlays"
      :trade-markers="ledgerMarkers"
      :loading="loadingKline"
      :error="errorKline"
      @retry="loadKline(code, ++loadToken)"
    />

    <StockNewsPanel
      :items="tickerNews"
      :loading="newsLoading"
      :empty-label="`No news yet for ${quote?.symbol || code}.`"
      @refresh="news.loadTicker(code, true)"
    />

    <StockAlertModal
      :open="showAlertModal"
      v-model:form="alertForm"
      :title="quote?.symbol || code"
      @close="showAlertModal = false"
      @save="saveAlert"
    />
  </div>
</template>
