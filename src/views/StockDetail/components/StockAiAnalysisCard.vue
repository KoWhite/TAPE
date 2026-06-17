<script setup lang="ts">
import IconBrain from '~icons/lucide/brain'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconStreamlineFlexCriticalthinking2 from '~icons/streamline-flex/critical-thinking-2'
import { storeToRefs } from 'pinia'
import { aiChat, aiChatStream } from '@/api/ai'
import { useAiStore } from '@/stores/ai'
import { useStockAiAnalysisStore } from '@/stores/stockAiAnalysis'
import { formatCompact, formatPercent, formatRevenueCompact } from '@/utils/format'
import {
  buildAnalysisPrompt,
  computeTechnicalSetup,
  fmtOptionalPercent,
  fmtPlainPercent,
  fmtPrice,
  fmtSigned,
  parseAnalysisContent,
  sanitizeAnalysis,
  type TechnicalSetup,
} from '@/utils/technicalSetup'
import type { EarningsRecord } from '@/types/earnings'
import type { InstitutionalContext } from '@/types/institutional'
import type { KlineBar } from '@/types/kline'
import type { NewsItem } from '@/types/news'
import type { Quote } from '@/types/stock'

const props = defineProps<{
  code: string
  quote: Quote | null
  bars: KlineBar[]
  quoteLoading?: boolean
  klineLoading?: boolean
  news: NewsItem[]
  newsLoading?: boolean
  earnings: EarningsRecord | null
  earningsLoading?: boolean
  institutional?: InstitutionalContext | null
  institutionalLoading?: boolean
  contextReady?: boolean
  contextLoading?: boolean
}>()

const ai = useAiStore()
const cache = useStockAiAnalysisStore()
const { providersLoading, hasConfiguredProvider } = storeToRefs(ai)

const loading = ref(false)
const error = ref<string | null>(null)
const visibleContent = ref('')
const loadingHintIndex = ref(0)
let hintTimer: number | null = null

const loadingHints = [
  'Scoring technical setup',
  'Mapping support and resistance',
  'Checking institutional context cache',
  'Checking earnings context',
  'Preparing action summary',
]

const cached = computed(() => cache.getToday(props.code))
const cacheTimeLabel = computed(() => {
  if (!cached.value?.generatedAt) return ''
  return new Date(cached.value.generatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const enoughContext = computed(() => Boolean(props.code && props.quote))
const hasTechnicalContext = computed(() => props.bars.length >= 30)
const autoAnalysisReady = computed(
  () => Boolean(props.contextReady && enoughContext.value && hasTechnicalContext.value),
)
const contextStatusLabel = computed(() => {
  if (autoAnalysisReady.value) return 'Full context ready.'
  if (props.quoteLoading || !props.quote) return 'Waiting for quote.'
  if (props.klineLoading) return 'Waiting for K-line data.'
  if (!hasTechnicalContext.value) return 'Waiting for enough K-line bars.'
  if (props.newsLoading) return 'Waiting for recent news.'
  if (props.earningsLoading) return 'Waiting for earnings context.'
  if (props.institutionalLoading) return 'Waiting for filing context.'
  if (props.contextLoading) return 'Waiting for context requests to finish.'
  return 'Preparing analysis context.'
})

const analysisView = computed(() => parseAnalysisContent(visibleContent.value))

const technicalSetup = computed<TechnicalSetup | null>(() =>
  computeTechnicalSetup(props.bars, props.quote),
)

const setupToneClass = computed(() => {
  const tone = technicalSetup.value?.tone
  if (tone === 'buy') return 'text-[var(--tape-up)] bg-[var(--tape-up-soft)]'
  if (tone === 'sell') return 'text-[var(--tape-down)] bg-[var(--tape-down-soft)]'
  return 'text-[var(--tape-warn)] bg-[rgba(217,119,6,0.08)]'
})

watch(
  cached,
  (entry) => {
    if (!entry || loading.value) return
    error.value = null
    visibleContent.value = entry.content
  },
  { immediate: true },
)

watch(
  [() => props.code, autoAnalysisReady, hasConfiguredProvider],
  () => {
    if (!autoAnalysisReady.value || !hasConfiguredProvider.value || loading.value) return
    if (cache.getToday(props.code)) return
    void generate(false)
  },
  { immediate: true },
)

onMounted(() => {
  cache.prune()
  void ai.loadProviders()
})

onBeforeUnmount(() => stopHintTimer())

function buildPrompt(): string {
  return buildAnalysisPrompt({
    code: props.code,
    quote: props.quote,
    bars: props.bars,
    setup: technicalSetup.value,
    news: props.news,
    earnings: props.earnings,
    institutional: props.institutional,
  })
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

async function generate(force = true): Promise<void> {
  if (!hasConfiguredProvider.value || loading.value || !autoAnalysisReady.value) return
  if (!force && cache.getToday(props.code)) return
  loading.value = true
  error.value = null
  visibleContent.value = force ? '' : visibleContent.value
  startHintTimer()
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a US stock analysis assistant. Reply in Simplified Chinese plain text with no Markdown symbols or bullet points. Use this exact Chinese structure, separated by blank lines: 行动结论：one concise conditional summary using 买入观察 / 继续等待 / 风险偏空. 技术结构：1-2 sentences on MA/EMA trend. 关键位置：support, resistance, trigger, invalidation. 动量波动：RSI/MACD/Bollinger/ATR in 1-2 sentences. 量能确认：volume confirmation in one sentence. 基本面事件：fundamental, news, earnings context when supplied. 风险：main risks. 下一步：specific condition to watch next. Use the supplied technical levels and explain conditions. Do not invent filing or institutional data that was not supplied. This is informational analysis, not personalized investment advice.',
    },
    { role: 'user' as const, content: buildPrompt() },
  ]
  let streamed = false
  let raw = ''
  try {
    await aiChatStream(
      { temperature: 0.2, maxTokens: 1500, messages },
      {
        onDelta(delta) {
          streamed = true
          raw += delta
          visibleContent.value = sanitizeAnalysis(raw)
        },
        onFinish() {
          const normalized = sanitizeAnalysis(raw)
          visibleContent.value = normalized
          cache.saveToday(props.code, normalized)
        },
      },
    )
  } catch (e) {
    if (streamed) {
      error.value = (e as Error).message
    } else {
      try {
        const res = await aiChat({ temperature: 0.2, maxTokens: 1500, messages })
        const normalized = sanitizeAnalysis(res.content)
        visibleContent.value = normalized
        cache.saveToday(props.code, normalized)
      } catch (fallbackError) {
        error.value = (fallbackError as Error).message
      }
    }
  } finally {
    loading.value = false
    stopHintTimer()
  }
}
</script>

<template>
  <article class="surface p-4 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2 min-w-0">
        <IconBrain class="size-4 text-[var(--tape-info)] shrink-0" />
        <div class="min-w-0">
          <h3 class="font-semibold tracking-tight">AI Stock Analysis</h3>
          <p class="text-xs text-muted mt-0.5">
            Technical setup plus AI context.
            <span v-if="cacheTimeLabel" class="text-soft">Cached today {{ cacheTimeLabel }}</span>
          </p>
        </div>
      </div>
      <button
        class="btn-primary h-8 px-3 text-xs"
        :disabled="loading || providersLoading || !hasConfiguredProvider || !autoAnalysisReady"
        @click="generate(true)"
      >
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-pulse opacity-80'" />
        {{ cached ? 'Regenerate' : 'Analyze' }}
      </button>
    </header>

    <section v-if="technicalSetup" class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-bg-elev)] p-3 sm:p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-wider text-soft">Current setup</div>
          <div class="mt-1 flex items-center gap-2 flex-wrap">
            <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="setupToneClass">
              {{ technicalSetup.label }}
            </span>
            <span class="text-mono text-sm font-semibold">{{ technicalSetup.score }}/100</span>
          </div>
        </div>
        <p class="text-xs text-soft max-w-[28ch] text-right">
          {{ technicalSetup.summary }}
        </p>
      </div>

      <div class="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2">
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Support</div>
          <div class="text-mono text-base font-semibold mt-0.5">
            {{ technicalSetup.support ? fmtPrice(technicalSetup.support.price) : '--' }}
          </div>
          <div class="text-[10px] text-muted">
            {{ technicalSetup.support ? `${formatPercent(-technicalSetup.support.distance)} below` : 'No nearby level' }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Resistance</div>
          <div class="text-mono text-base font-semibold mt-0.5">
            {{ technicalSetup.resistance ? fmtPrice(technicalSetup.resistance.price) : '--' }}
          </div>
          <div class="text-[10px] text-muted">
            {{ technicalSetup.resistance ? `${formatPercent(technicalSetup.resistance.distance)} above` : 'No nearby level' }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Momentum</div>
          <div class="text-mono text-base font-semibold mt-0.5">
            RSI14 {{ technicalSetup.rsi.rsi14 === null ? '--' : technicalSetup.rsi.rsi14.toFixed(1) }}
          </div>
          <div class="text-[10px] text-muted">
            MACD {{ fmtSigned(technicalSetup.macd.hist) }} · RSI6/24
            {{ technicalSetup.rsi.rsi6 === null || technicalSetup.rsi.rsi24 === null ? '--' : `${technicalSetup.rsi.rsi6.toFixed(0)}/${technicalSetup.rsi.rsi24.toFixed(0)}` }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Trigger</div>
          <div class="text-xs font-medium mt-1 leading-5">{{ technicalSetup.trigger }}</div>
          <div class="text-[10px] text-muted mt-0.5">Invalid: {{ technicalSetup.invalidation }}</div>
        </div>
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Trend stack</div>
          <div class="text-mono text-base font-semibold mt-0.5">
            {{ fmtPrice(technicalSetup.ma.ma20) }} / {{ fmtPrice(technicalSetup.ma.ma50) }}
          </div>
          <div class="text-[10px] text-muted">
            MA5 {{ fmtPrice(technicalSetup.ma.ma5) }} · MA200 {{ fmtPrice(technicalSetup.ma.ma200) }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Bollinger / ATR</div>
          <div class="text-mono text-base font-semibold mt-0.5">
            %B {{ technicalSetup.boll.percentB === null ? '--' : technicalSetup.boll.percentB.toFixed(2) }}
          </div>
          <div class="text-[10px] text-muted">
            ATR {{ fmtPrice(technicalSetup.atr14) }} · BW {{ fmtPlainPercent(technicalSetup.boll.bandwidth) }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-surface)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Volume</div>
          <div class="text-mono text-base font-semibold mt-0.5">
            {{ technicalSetup.volume.ratio === null ? '--' : `${technicalSetup.volume.ratio.toFixed(2)}x` }}
          </div>
          <div class="text-[10px] text-muted">
            Vol {{ technicalSetup.volume.latest === null ? '--' : formatCompact(technicalSetup.volume.latest) }}
          </div>
        </div>
      </div>
    </section>

    <section
      v-if="institutional?.available && institutional.metrics"
      class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-surface)] p-3 sm:p-4 space-y-3"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-wider text-soft">Filing context</div>
          <div class="mt-1 text-sm font-semibold truncate">
            {{ institutional.companyName || institutional.symbol || code }}
          </div>
        </div>
        <div class="text-right text-[10px] text-muted leading-4 shrink-0">
          SEC cached
          <div>{{ institutional.periods?.latestFiled || '--' }}</div>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div class="rounded-lg bg-[var(--tape-bg-elev)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Revenue TTM</div>
          <div class="text-mono text-sm font-semibold mt-0.5">
            {{ formatRevenueCompact(institutional.metrics.revenueTtm) }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-bg-elev)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Net margin</div>
          <div class="text-mono text-sm font-semibold mt-0.5">
            {{ fmtOptionalPercent(institutional.metrics.netMarginTtm) }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-bg-elev)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">FCF TTM</div>
          <div class="text-mono text-sm font-semibold mt-0.5">
            {{ formatRevenueCompact(institutional.metrics.freeCashFlowTtm) }}
          </div>
        </div>
        <div class="rounded-lg bg-[var(--tape-bg-elev)] px-3 py-2">
          <div class="text-[10px] uppercase tracking-wider text-soft">Debt load</div>
          <div class="text-mono text-sm font-semibold mt-0.5">
            {{ fmtOptionalPercent(institutional.metrics.liabilitiesToAssets) }}
          </div>
        </div>
      </div>
    </section>
    <p v-else-if="institutionalLoading" class="text-xs text-soft">
      Loading filing context before AI analysis starts.
    </p>

    <p v-if="!hasConfiguredProvider && !providersLoading" class="text-xs text-soft">
      Configure an AI provider in the bridge environment to add narrative context. Technical setup still works locally.
    </p>
    <p v-else-if="error" class="text-xs text-[var(--tape-down)]">{{ error }}</p>
    <section v-else-if="visibleContent" class="space-y-3">
      <div class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-bg-elev)] px-3.5 py-3">
        <div class="text-[10px] uppercase tracking-wider text-soft">Action summary</div>
        <p class="mt-1 text-sm sm:text-base leading-6 font-medium text-[var(--tape-text)] break-words">
          {{ analysisView.summary }}<span v-if="loading" class="animate-pulse text-[var(--tape-info)]">|</span>
        </p>
      </div>

      <div class="divide-y divide-[var(--tape-border)] rounded-lg border border-[var(--tape-border)] bg-[var(--tape-surface)] overflow-hidden">
        <section
          v-for="section in analysisView.sections"
          :key="section.title"
          class="px-3.5 py-3 sm:px-4 sm:py-3.5"
        >
          <h4 class="text-xs font-semibold text-[var(--tape-text)] tracking-tight">
            {{ section.title }}
          </h4>
          <div class="mt-1.5 space-y-1.5">
            <p
              v-for="line in section.body"
              :key="line"
              class="text-sm leading-6 text-muted break-words"
            >
              {{ line }}
            </p>
          </div>
        </section>
      </div>
    </section>
    <div v-else-if="loading" class="space-y-3">
      <div class="flex items-center gap-2 text-xs text-soft">
        <IconStreamlineFlexCriticalthinking2 class="size-3.5 animate-pulse opacity-80 text-[var(--tape-info)]" />
        {{ loadingHints[loadingHintIndex] }}
      </div>
      <div class="space-y-2">
        <div class="h-3 skeleton rounded-full w-5/6" />
        <div class="h-3 skeleton rounded-full w-3/4" />
        <div class="h-3 skeleton rounded-full w-4/5" />
      </div>
    </div>
    <p v-else class="text-xs text-soft">
      {{ contextStatusLabel }} Analysis starts automatically after all data requests finish.
    </p>
  </article>
</template>
