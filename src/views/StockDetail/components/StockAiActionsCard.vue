<script setup lang="ts">
import { computed, ref } from 'vue'
import IconSparkles from '~icons/lucide/sparkles'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconArrowUpRight from '~icons/lucide/arrow-up-right'
import IconArrowDownRight from '~icons/lucide/arrow-down-right'
import IconHand from '~icons/lucide/hand'
import IconShield from '~icons/lucide/shield'
import IconRotateCw from '~icons/lucide/rotate-cw'
import {
  aiSuggestActions,
  type AiActionItem,
  type AiActionPosition,
  type AiActionResponse,
  type AiActionType,
} from '@/api/ai'
import type { Quote } from '@/types/stock'
import { usePortfolioStore } from '@/stores/portfolio'

const props = defineProps<{
  code: string
  quote: Quote | null
  /** Headlines for the LLM — at most 5 are passed up. */
  news?: { title: string; provider?: string; publishedAt?: string }[]
}>()

const portfolio = usePortfolioStore()
const result = ref<AiActionResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const position = computed(() => portfolio.find(props.code))
const plan = computed(() => portfolio.planFor(props.code))

const canSuggest = computed(() => Boolean(props.quote))

function actionLabel(a: AiActionType): string {
  return {
    buy: 'Buy',
    sell: 'Sell',
    hold: 'Hold',
    trim: 'Trim',
    stop_loss: 'Stop loss',
    take_profit: 'Take profit',
  }[a]
}

const ACTION_STYLE: Record<AiActionType, { fg: string; bg: string }> = {
  buy: { fg: 'var(--tape-up)', bg: 'var(--tape-up-soft)' },
  take_profit: { fg: 'var(--tape-up)', bg: 'var(--tape-up-soft)' },
  sell: { fg: 'var(--tape-down)', bg: 'var(--tape-down-soft)' },
  trim: { fg: 'var(--tape-down)', bg: 'var(--tape-down-soft)' },
  stop_loss: { fg: 'var(--tape-down)', bg: 'var(--tape-down-soft)' },
  hold: { fg: 'var(--tape-text)', bg: 'var(--tape-button-bg)' },
}

function ActionIcon(action: AiActionType) {
  if (action === 'buy') return IconArrowUpRight
  if (action === 'sell' || action === 'trim') return IconArrowDownRight
  if (action === 'stop_loss') return IconShield
  if (action === 'take_profit') return IconArrowUpRight
  return IconHand
}

async function suggest(): Promise<void> {
  if (!canSuggest.value || loading.value) return
  loading.value = true
  error.value = null
  try {
    const q = props.quote!
    const pos = position.value
    const positions: AiActionPosition[] = [
      {
        code: props.code,
        symbol: q.symbol,
        shares: pos?.shares,
        avgCost: pos?.avgCost,
        last: q.last,
        pnl: pos ? (q.last - pos.avgCost) * pos.shares : undefined,
        pnlPct: pos && pos.avgCost ? (q.last - pos.avgCost) / pos.avgCost : undefined,
        takeProfitPrice: plan.value?.takeProfitPrice,
        stopLossPrice: plan.value?.stopLossPrice,
        news: (props.news ?? []).slice(0, 5).map((n) => ({
          title: n.title,
          source: n.provider,
          publishedAt: n.publishedAt,
        })),
      },
    ]
    result.value = await aiSuggestActions({ positions, mode: 'symbol' })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function applyToExitPlan(item: AiActionItem): void {
  if (!item.suggestedPrice) return
  const current = plan.value
  const next = {
    code: item.code,
    enabled: current?.enabled ?? true,
    takeProfitPrice: current?.takeProfitPrice,
    stopLossPrice: current?.stopLossPrice,
    targetWeight: current?.targetWeight,
    note: current?.note,
  }
  if (item.action === 'take_profit') next.takeProfitPrice = item.suggestedPrice
  else if (item.action === 'stop_loss') next.stopLossPrice = item.suggestedPrice
  portfolio.saveExitPlan(next)
}
</script>

<template>
  <article class="surface p-4 space-y-3">
    <header class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="size-7 rounded-md bg-[var(--tape-button-bg)] flex-center text-soft">
          <IconSparkles class="size-3.5" />
        </span>
        <div>
          <div class="text-sm font-semibold">AI Action Suggestions</div>
          <div class="text-[11px] text-soft">Structured next-step recommendations for {{ quote?.symbol || code }}</div>
        </div>
      </div>
      <button
        class="btn-outline h-8 px-3 text-xs disabled:opacity-50"
        :disabled="!canSuggest || loading"
        @click="suggest"
      >
        <IconRotateCw v-if="!loading" class="size-3 mr-1" />
        <span v-if="loading">Thinking…</span>
        <span v-else-if="result">Refresh</span>
        <span v-else>Suggest</span>
      </button>
    </header>

    <div
      v-if="error"
      class="flex items-start gap-2 text-[12px] text-[var(--tape-down)] bg-[var(--tape-down-soft)] px-3 py-2 rounded-md"
    >
      <IconAlertCircle class="size-3.5 mt-0.5 shrink-0" />
      <div class="flex-1">{{ error }}</div>
    </div>

    <div v-if="result?.headline" class="text-[13px] text-muted">
      {{ result.headline }}
    </div>

    <ul v-if="result?.actions.length" class="divide-y divide-[var(--tape-border)]">
      <li v-for="item in result.actions" :key="`${item.code}:${item.action}`" class="py-2.5 flex items-start gap-3">
        <span
          class="size-7 rounded-md flex-center shrink-0"
          :style="{ color: ACTION_STYLE[item.action].fg, backgroundColor: ACTION_STYLE[item.action].bg }"
        >
          <component :is="ActionIcon(item.action)" class="size-3.5" />
        </span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold">{{ actionLabel(item.action) }}</span>
            <span v-if="item.suggestedShares" class="text-mono text-[11px] text-soft">
              {{ item.suggestedShares }} sh
            </span>
            <span v-if="item.suggestedPrice" class="text-mono text-[11px] text-soft">
              @ {{ item.suggestedPrice.toFixed(2) }}
            </span>
            <span class="text-[10px] text-soft tabular-nums ml-auto">
              {{ (item.confidence * 100).toFixed(0) }}% conf
            </span>
          </div>
          <p class="text-[12px] text-muted mt-1 leading-relaxed">
            {{ item.rationale }}
          </p>
          <div
            v-if="item.action === 'take_profit' || item.action === 'stop_loss'"
            class="mt-1.5"
          >
            <button
              class="text-[11px] btn-outline h-7 px-2"
              :disabled="!item.suggestedPrice"
              @click="applyToExitPlan(item)"
            >
              Apply to exit plan
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div
      v-else-if="!result && !loading"
      class="text-[12px] text-soft py-1"
    >
      Click <span class="text-mono">Suggest</span> for AI-generated buy / hold / trim recommendations with rationale.
    </div>
  </article>
</template>
