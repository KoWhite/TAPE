<script setup lang="ts">
import IconBrain from '~icons/lucide/brain'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconStreamlineFlexCriticalthinking2 from '~icons/streamline-flex/critical-thinking-2'
import { storeToRefs } from 'pinia'
import { aiChat, aiChatStream } from '@/api/ai'
import { useAiStore } from '@/stores/ai'
import { formatChange, formatPercent } from '@/utils/format'
import type { PortfolioRow, PortfolioSummary } from '../types'
import type { PortfolioTransactionRow } from '../types'

const props = defineProps<{
  rows: PortfolioRow[]
  summary: PortfolioSummary
  transactions: PortfolioTransactionRow[]
}>()

const ai = useAiStore()
const { providersLoading, hasConfiguredProvider } = storeToRefs(ai)

const loading = ref(false)
const error = ref<string | null>(null)
const content = ref('')
const loadingHintIndex = ref(0)

let hintTimer: number | null = null

const loadingHints = [
  'Reading portfolio exposure',
  'Checking exit plans',
  'Reviewing recent transactions',
  'Preparing risk diagnosis',
]

const loadingHint = computed(() => loadingHints[loadingHintIndex.value])

function sanitize(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildPrompt(): string {
  const rows = props.rows.map((r) =>
    `${r.symbol} ${r.code}: weight ${(r.weight * 100).toFixed(1)}%, shares ${r.shares}, value ${r.value.toFixed(2)}, unrealized ${formatChange(r.unrealizedPnl)} (${formatPercent(r.pnlPct)}), realized ${formatChange(r.realizedPnl)}, TP ${r.takeProfitPrice ?? 'n/a'}, SL ${r.stopLossPrice ?? 'n/a'}, targetWeight ${r.targetWeight ? `${(r.targetWeight * 100).toFixed(1)}%` : 'n/a'}`,
  )
  const recent = props.transactions.slice(0, 12).map((tx) =>
    `${tx.date} ${tx.type} ${tx.symbol} ${tx.shares} @ ${tx.price}, reason ${tx.reason ?? 'n/a'}`,
  )
  return [
    `Portfolio summary: market value ${props.summary.value.toFixed(2)}, cost ${props.summary.cost.toFixed(2)}, unrealized ${formatChange(props.summary.unrealizedPnl)}, realized ${formatChange(props.summary.realizedPnl)}, total return ${formatPercent(props.summary.totalReturnPct)}, today ${formatChange(props.summary.dayChange)}.`,
    `Open positions:\n${rows.length ? rows.join('\n') : 'No open positions.'}`,
    `Recent transactions:\n${recent.length ? recent.join('\n') : 'No transactions.'}`,
  ].join('\n\n')
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

async function generate(): Promise<void> {
  if (!hasConfiguredProvider.value || loading.value) return
  loading.value = true
  error.value = null
  content.value = ''
  startHintTimer()
  const messages = [
    {
      role: 'system' as const,
      content:
        '你是美股组合风控和交易复盘助手。用中文纯文本输出，不要 Markdown 符号。结构为：总体判断、主要风险、计划缺口、可执行观察点。只做风险分析和流程建议，不给个性化买卖指令。',
    },
    { role: 'user' as const, content: buildPrompt() },
  ]
  let streamed = false
  let raw = ''
  try {
    await aiChatStream(
      { temperature: 0.2, maxTokens: 1400, messages },
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
        const res = await aiChat({ temperature: 0.2, maxTokens: 1400, messages })
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

onMounted(() => void ai.loadProviders())
onBeforeUnmount(() => stopHintTimer())
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconBrain class="size-4 text-[var(--tape-info)]" />
        <div>
          <h3 class="font-semibold tracking-tight">AI Portfolio Diagnosis</h3>
          <p class="text-xs text-muted mt-0.5">
            Concentration, plan gaps, and recent trading behavior.
          </p>
        </div>
      </div>
      <button
        class="btn-primary h-8 px-3 text-xs"
        :disabled="loading || providersLoading || !hasConfiguredProvider"
        @click="generate"
      >
        <IconRefreshCw class="size-3.5" :class="loading && 'animate-pulse opacity-80'" />
        Diagnose
      </button>
    </header>

    <p v-if="!hasConfiguredProvider && !providersLoading" class="text-xs text-soft">
      Configure an AI provider in the bridge environment to run diagnosis.
    </p>
    <p v-else-if="error" class="text-xs text-[var(--tape-down)]">{{ error }}</p>
    <div v-else-if="content" class="text-sm leading-6 whitespace-pre-line break-words">
      {{ content }}<span v-if="loading" class="animate-pulse text-[var(--tape-info)]">|</span>
    </div>
    <div v-else-if="loading" class="space-y-3">
      <div class="flex items-center gap-2 text-xs text-soft">
        <IconStreamlineFlexCriticalthinking2 class="size-3.5 animate-pulse opacity-80 text-[var(--tape-info)]" />
        {{ loadingHint }}
      </div>
      <div class="space-y-2">
        <div class="h-3 skeleton rounded-full w-5/6" />
        <div class="h-3 skeleton rounded-full w-3/4" />
        <div class="h-3 skeleton rounded-full w-4/5" />
      </div>
    </div>
    <p v-else class="text-xs text-soft">
      Run a diagnosis after adding positions, exit plans, or recent transactions.
    </p>
  </article>
</template>
