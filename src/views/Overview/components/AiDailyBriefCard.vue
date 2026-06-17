<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import IconSparkles from '~icons/lucide/sparkles'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconStreamlineFlexCriticalthinking2 from '~icons/streamline-flex/critical-thinking-2'
import { aiChat, aiChatStream } from '@/api/ai'
import { useAiDailyBriefStore } from '@/stores/aiDailyBrief'
import { useAiStore } from '@/stores/ai'
import { useAlertsStore } from '@/stores/alerts'
import { useEarningsStore } from '@/stores/earnings'
import { useFearGreedStore } from '@/stores/fearGreed'
import { useNewsStore } from '@/stores/news'
import { usePortfolioStore } from '@/stores/portfolio'
import { useWatchlistStore } from '@/stores/watchlist'
import { useQuotes } from '@/composables/useQuotes'
import { formatChange, formatPercent } from '@/utils/format'
import { getQuoteValuation } from '@/utils/quoteValuation'

const { t } = useI18n()
const ai = useAiStore()
const dailyBrief = useAiDailyBriefStore()
const alerts = useAlertsStore()
const earnings = useEarningsStore()
const fearGreed = useFearGreedStore()
const news = useNewsStore()
const portfolio = usePortfolioStore()
const watchlist = useWatchlistStore()
const { quotes } = useQuotes()
const { providersLoading, hasConfiguredProvider, webSearchConfigured } = storeToRefs(ai)

const loading = ref(false)
const error = ref<string | null>(null)
const briefText = ref<string | null>(null)
const visibleBrief = ref('')
const typing = ref(false)
const loadingHintIndex = ref(0)
const reasoningText = ref('')
const reasoningExpanded = ref(true)
const reasoningEl = ref<HTMLElement | null>(null)

let typeTimer: number | null = null
let hintTimer: number | null = null

interface DailyBriefJson {
  title?: string
  summary?: string
  sections?: Array<{
    title?: string
    items?: string[]
  }>
  watch?: string[]
}

// i18n key suffixes under overview.brief.hints.*; translated at render time
// so the rotating hint follows the active locale.
const loadingHintKeys = ['context', 'alerts', 'headlines', 'news', 'prepare'] as const

const portfolioRows = computed(() =>
  portfolio.positions.map((p) => {
    const q = quotes.value.get(p.code)
    const valuation = getQuoteValuation(q)
    const value = valuation ? p.shares * valuation.price : 0
    const day = valuation ? p.shares * valuation.change : 0
    return {
      code: p.code,
      symbol: p.symbol,
      value,
      day,
      dayPct: valuation?.changePct ?? 0,
      pnl: q ? value - (p.costBasis ?? p.shares * p.avgCost) + p.realizedPnl + p.dividends : 0,
    }
  }),
)

const portfolioSummary = computed(() => {
  const value = portfolioRows.value.reduce((s, r) => s + r.value, 0)
  const day = portfolioRows.value.reduce((s, r) => s + r.day, 0)
  const pnl = portfolioRows.value.reduce((s, r) => s + r.pnl, 0)
  return { value, day, pnl }
})

const trackedCodes = computed(() => {
  const set = new Set<string>(watchlist.codes)
  for (const p of portfolio.positions) set.add(p.code)
  return [...set]
})

const upcomingEarnings = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const max = new Date(today)
  max.setDate(today.getDate() + 14)
  return trackedCodes.value
    .map((code) => ({ code, record: earnings.get(code) }))
    .filter((x) => {
      if (!x.record?.nextDate) return false
      const d = new Date(`${x.record.nextDate}T00:00:00`)
      return d >= today && d <= max
    })
    .slice(0, 8)
})

const reasoningTokenLabel = computed(() => {
  const n = reasoningText.value.length
  if (!n) return t('overview.brief.chars', { count: 0 })
  if (n < 1000) return t('overview.brief.chars', { count: n })
  return t('overview.brief.kchars', { count: (n / 1000).toFixed(1) })
})

const currentHint = computed(() =>
  t(`overview.brief.hints.${loadingHintKeys[loadingHintIndex.value]}`),
)

const marketNews = computed(() => news.get('__market__')?.items.slice(0, 5) ?? [])
const todayBrief = computed(() => dailyBrief.todayBrief)
const cacheTimeLabel = computed(() => {
  const generatedAt = todayBrief.value?.generatedAt
  if (!generatedAt) return ''
  return new Date(generatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

onMounted(() => {
  dailyBrief.prune()
  void ai.loadProviders()
  void fearGreed.load()
  void news.loadMarket()
  void earnings.loadMissing(trackedCodes.value)
})

onBeforeUnmount(() => {
  stopTyping()
  stopHintTimer()
})

watch(
  todayBrief,
  (entry) => {
    if (!entry || loading.value) return
    stopTyping()
    error.value = null
    briefText.value = entry.content
    visibleBrief.value = entry.content
    // Cached briefs don't carry reasoning, so make sure a stale chain
    // from an earlier in-memory run doesn't keep showing.
    reasoningText.value = ''
  },
  { immediate: true },
)

function buildPrompt(): string {
  const fg = fearGreed.data
  const positions = portfolioRows.value
    .slice()
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8)
    .map((r) => `${r.symbol} ${r.code}: value ${r.value.toFixed(2)}, today ${formatChange(r.day)} (${formatPercent(r.dayPct)}), total PnL ${formatChange(r.pnl)}`)
  const triggered = alerts.rules
    .filter((r) => r.triggered)
    .slice(0, 6)
    .map((r) => `${r.symbol} ${r.code}: triggered ${r.type} ${r.threshold}`)
  const earningsLines = upcomingEarnings.value.map((x) => {
    const r = x.record!
    return `${x.code}: ${r.nextDate}, EPS est ${r.nextEpsEstimate ?? 'n/a'}, revenue est ${r.nextRevenueEstimate ?? 'n/a'}`
  })
  const newsLines = marketNews.value.map((n) => `${n.provider}: ${n.title}`)

  return [
    `Date: ${new Date().toLocaleDateString('en-US')}`,
    `Portfolio: market value ${portfolioSummary.value.value.toFixed(2)}, today ${formatChange(portfolioSummary.value.day)}, total PnL ${formatChange(portfolioSummary.value.pnl)}.`,
    `Top positions:\n${positions.length ? positions.join('\n') : 'No positions tracked.'}`,
    `Fear and Greed: ${fg ? `${fg.score ?? 'n/a'} (${fg.rating ?? 'n/a'})` : 'not available'}.`,
    `Triggered alerts:\n${triggered.length ? triggered.join('\n') : 'None.'}`,
    `Upcoming earnings in 14 days:\n${earningsLines.length ? earningsLines.join('\n') : 'None.'}`,
    `Market headlines:\n${newsLines.length ? newsLines.join('\n') : 'No market headlines loaded.'}`,
  ].join('\n\n')
}

function stopTyping(): void {
  if (typeTimer) window.clearInterval(typeTimer)
  typeTimer = null
  typing.value = false
}

function stopHintTimer(): void {
  if (hintTimer) window.clearInterval(hintTimer)
  hintTimer = null
}

function startHintTimer(): void {
  stopHintTimer()
  loadingHintIndex.value = 0
  hintTimer = window.setInterval(() => {
    loadingHintIndex.value = (loadingHintIndex.value + 1) % loadingHintKeys.length
  }, 1400)
}

function sanitizePlainText(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatJsonBrief(data: DailyBriefJson): string {
  const lines: string[] = []
  if (data.title) lines.push(data.title)
  if (data.summary) lines.push(data.summary)
  for (const section of data.sections ?? []) {
    if (section.title) lines.push('', section.title)
    for (const item of section.items ?? []) lines.push(`- ${item}`)
  }
  if (data.watch?.length) {
    lines.push('', '今日重点')
    for (const item of data.watch) lines.push(`- ${item}`)
  }
  return sanitizePlainText(lines.join('\n'))
}

function normalizeBrief(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as DailyBriefJson
    return formatJsonBrief(parsed)
  } catch {
    return sanitizePlainText(raw)
  }
}

function dailyBriefMessages() {
  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
  const searchClause = webSearchConfigured.value
    ? `今天是 ${todayStr}。你已具备联网搜索能力：当用户的本地新闻摘要为空、过时，或需要确认最新发生的事件（如美联储议息结果、重大财报、地缘冲突、个股突发消息）时，必须先调用 search_web 工具拉取最新信息再撰写日报，至少调用 1 次。优先使用 topic="news" 且 days<=2。`
    : `今天是 ${todayStr}。请仅依据下文提供的数据撰写日报，不要编造任何未在数据中出现的新闻、价格或事件。`
  return [
    {
      role: 'system' as const,
      content:
        '你是美股个人投研工作台的 AI 日报助手。必须用中文输出纯文本。不要使用 Markdown 标记，不要使用 #、**、表格或代码块。格式固定为：第一行一句总览；然后用短标题分段，每段 2-3 条短句。聚焦市场环境、组合风险、财报/告警、今日观察点，不提供个性化投资建议。' +
        '\n' + searchClause,
    },
    {
      role: 'user' as const,
      content: buildPrompt(),
    },
  ]
}

function startTypewriter(text: string): void {
  stopTyping()
  briefText.value = text
  visibleBrief.value = ''
  typing.value = true
  let i = 0
  typeTimer = window.setInterval(() => {
    const step = text.charCodeAt(i) > 255 ? 2 : 3
    visibleBrief.value = text.slice(0, i + step)
    i += step
    if (i >= text.length) {
      visibleBrief.value = text
      stopTyping()
    }
  }, 18)
}

function scrollReasoningToBottom(): void {
  void nextTick(() => {
    const el = reasoningEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function generate(): Promise<void> {
  if (!hasConfiguredProvider.value || loading.value) return
  stopTyping()
  loading.value = true
  error.value = null
  briefText.value = null
  visibleBrief.value = ''
  reasoningText.value = ''
  reasoningExpanded.value = true
  typing.value = true
  startHintTimer()
  let streamed = false
  let raw = ''
  try {
    await aiChatStream({
      temperature: 0.25,
      maxTokens: 1600,
      messages: dailyBriefMessages(),
      enableWebSearch: webSearchConfigured.value,
    }, {
      onDelta(content) {
        streamed = true
        raw += content
        visibleBrief.value = raw
      },
      onReasoning(chunk) {
        reasoningText.value += chunk
        scrollReasoningToBottom()
      },
      onFinish() {
        const normalized = sanitizePlainText(raw)
        visibleBrief.value = normalized
        briefText.value = normalized
        dailyBrief.saveToday(normalized)
      },
    })
  } catch (e) {
    if (streamed) {
      error.value = (e as Error).message
    } else {
      try {
        const res = await aiChat({
          temperature: 0.25,
          maxTokens: 1600,
          messages: dailyBriefMessages(),
          enableWebSearch: webSearchConfigured.value,
        })
        const normalized = normalizeBrief(res.content)
        dailyBrief.saveToday(normalized)
        startTypewriter(normalized)
      } catch (fallbackError) {
        error.value = (fallbackError as Error).message
      }
    }
  } finally {
    loading.value = false
    if (!typeTimer) typing.value = false
    stopHintTimer()
  }
}
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconSparkles class="size-4 text-[var(--tape-info)]" />
        <div>
          <h3 class="font-semibold tracking-tight flex items-center gap-2">
            {{ t('overview.brief.title') }}
            <span
              v-if="webSearchConfigured"
              class="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
              :style="{
                background: 'var(--tape-info-soft)',
                color: 'var(--tape-info)',
                border: '1px solid var(--tape-info-soft)',
              }"
              :title="t('overview.brief.liveSearchTip')"
            >
              <span class="size-1.5 rounded-full" :style="{ background: 'var(--tape-info)' }" />
              {{ t('overview.brief.liveSearch') }}
            </span>
          </h3>
          <p class="text-[11px] text-muted mt-0.5">
            {{ t('overview.brief.subtitle') }}
            <span v-if="cacheTimeLabel" class="text-soft">
              {{ t('overview.brief.cachedToday', { time: cacheTimeLabel }) }}
            </span>
          </p>
        </div>
      </div>
      <button
        class="btn-primary h-8 px-3 text-xs"
        :disabled="loading || providersLoading || !hasConfiguredProvider"
        @click="generate"
      >
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-pulse opacity-80'" />
        {{ todayBrief ? t('overview.brief.regenerate') : t('overview.brief.generate') }}
      </button>
    </header>

    <p v-if="!hasConfiguredProvider && !providersLoading" class="text-xs text-soft">
      {{ t('overview.brief.noProvider') }}
    </p>
    <p v-else-if="error" class="text-xs text-[var(--tape-down)]">{{ error }}</p>

    <section
      v-if="reasoningText"
      class="reasoning-panel"
      :class="{ 'is-loading': loading, 'is-collapsed': !reasoningExpanded }"
    >
      <button
        type="button"
        class="reasoning-head"
        @click="reasoningExpanded = !reasoningExpanded"
      >
        <span class="reasoning-dot" />
        <IconStreamlineFlexCriticalthinking2 class="size-3.5 reasoning-icon" />
        <span class="reasoning-label">
          {{ loading ? t('overview.brief.thinking') : t('overview.brief.thoughtProcess') }}
        </span>
        <span v-if="loading" class="reasoning-meta">
          {{ reasoningTokenLabel }}
        </span>
        <span v-else class="reasoning-meta">
          {{ reasoningTokenLabel }} · {{ reasoningExpanded ? t('overview.brief.collapse') : t('overview.brief.expand') }}
        </span>
        <IconChevronDown
          class="size-3.5 reasoning-chevron"
          :class="{ 'is-open': reasoningExpanded }"
        />
      </button>
      <div
        v-show="reasoningExpanded"
        ref="reasoningEl"
        class="reasoning-body"
      >{{ reasoningText }}</div>
    </section>

    <div
      v-if="visibleBrief"
      class="text-sm leading-6 whitespace-pre-line break-words overflow-visible max-w-full"
    >
      {{ visibleBrief }}<span v-if="typing" class="animate-pulse text-[var(--tape-info)]">|</span>
    </div>
    <div v-else-if="loading && !reasoningText" class="space-y-3">
      <div class="flex items-center gap-2 text-xs text-soft">
        <IconStreamlineFlexCriticalthinking2 class="size-3.5 animate-pulse opacity-80 text-[var(--tape-info)]" />
        {{ currentHint }}
      </div>
      <div class="space-y-2">
        <div class="h-3 skeleton rounded-full w-5/6" />
        <div class="h-3 skeleton rounded-full w-3/4" />
        <div class="h-3 skeleton rounded-full w-4/5" />
      </div>
    </div>
    <p v-else-if="!loading && !visibleBrief && !error && hasConfiguredProvider" class="text-xs text-soft">
      {{ t('overview.brief.emptyHint') }}
    </p>
  </article>
</template>

<style scoped>
.reasoning-panel {
  border: 1px solid var(--tape-border);
  background: linear-gradient(
    180deg,
    var(--tape-info-soft) 0%,
    transparent 100%
  );
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 160ms ease;
}
.reasoning-panel.is-loading {
  border-color: var(--tape-info-soft);
}

.reasoning-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--tape-text-muted);
  font-size: 11px;
  text-align: left;
  transition: background 140ms ease;
}
.reasoning-head:hover {
  background: var(--tape-button-bg);
}
.reasoning-panel.is-collapsed .reasoning-head {
  padding-bottom: 8px;
}

.reasoning-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tape-info);
  flex-shrink: 0;
  box-shadow: 0 0 0 0 var(--tape-info-soft);
}
.reasoning-panel.is-loading .reasoning-dot {
  animation: reasoning-pulse 1.4s ease-out infinite;
}
@keyframes reasoning-pulse {
  0% { box-shadow: 0 0 0 0 var(--tape-info-soft); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.reasoning-icon {
  color: var(--tape-info);
  flex-shrink: 0;
  opacity: 0.85;
}
.reasoning-panel.is-loading .reasoning-icon {
  animation: reasoning-spin 2.8s linear infinite;
}
@keyframes reasoning-spin {
  to { transform: rotate(360deg); }
}

.reasoning-label {
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--tape-text);
}

.reasoning-meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--tape-text-soft);
  font-variant-numeric: tabular-nums;
}

.reasoning-chevron {
  color: var(--tape-text-soft);
  transition: transform 160ms ease;
}
.reasoning-chevron.is-open {
  transform: rotate(180deg);
}

.reasoning-body {
  position: relative;
  font-family: var(--tape-font-mono);
  font-size: 11px;
  line-height: 1.65;
  color: var(--tape-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow-y: auto;
  padding: 10px 14px 14px;
  margin: 0 8px 8px;
  background: var(--tape-bg-elev);
  border: 1px solid var(--tape-border);
  border-radius: 8px;
  mask-image: linear-gradient(
    180deg,
    black 0%,
    black calc(100% - 16px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    180deg,
    black 0%,
    black calc(100% - 16px),
    transparent 100%
  );
}
.reasoning-body::-webkit-scrollbar {
  width: 6px;
}
.reasoning-body::-webkit-scrollbar-thumb {
  background: var(--tape-border-hover);
  border-radius: 999px;
}
.reasoning-body::-webkit-scrollbar-track {
  background: transparent;
}
</style>
