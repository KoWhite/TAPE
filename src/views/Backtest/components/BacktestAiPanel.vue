<script setup lang="ts">
import IconSparkles from '~icons/lucide/sparkles'
import IconStreamlineFlexCriticalthinking2 from '~icons/streamline-flex/critical-thinking-2'
import IconPlay from '~icons/lucide/play'
import IconAlert from '~icons/lucide/triangle-alert'
import IconCopy from '~icons/lucide/copy'
import { useAiStore } from '@/stores/ai'
import type { BacktestRequest } from '@/types/backtest'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

/**
 * AI workbench panel sits above the run button on the Backtest page and
 * offers two ways for the LLM to drive a backtest:
 *
 *   "suggest"  -> natural language to one of the existing template
 *                strategies + params. The frontend fills the form so
 *                the user can tweak before running.
 *
 *   "compose"  -> natural language to a DSL rule tree, executed by the
 *                `dsl` strategy. There is no form for the user to
 *                tweak, so they edit the prompt and re-compose.
 *
 * Either way, the panel emits an `apply` event with a ready-to-submit
 * BacktestRequest. The parent decides whether to refill the form or
 * just run it.
 */

interface Props {
  /** Default symbol/date/capital from the parent's form, used to seed
   *  the LLM's response so it doesn't have to invent these. */
  symbol: string
  startDate: string
  endDate: string
  initialCapital: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  apply: [request: BacktestRequest, mode: 'suggest' | 'compose']
}>()

type Mode = 'suggest' | 'compose'

const ai = useAiStore()
const mode = ref<Mode>('suggest')
const promptSuggest = ref('')
const promptCompose = ref('')
const hintIndex = ref(0)
let hintTimer: number | null = null

const modeMeta: Record<Mode, {
  label: string
  hint: string
  placeholder: string
  cta: string
}> = {
  suggest: {
    label: 'Suggest',
    hint: 'Describe the goal. AI will pick one template strategy and fill in editable parameters.',
    placeholder: 'Example: Prefer trend following, target medium-term swings, keep parameters conservative.',
    cta: 'Generate suggestion',
  },
  compose: {
    label: 'Compose',
    hint: 'AI compiles your description into a DSL rule tree using indicators, prices, comparisons, and crossovers.',
    placeholder: 'Example: Buy when RSI(14) crosses below 30 while close is above EMA(50), then sell when RSI moves back above 50.',
    cta: 'Compile strategy',
  },
}

const activeMeta = computed(() => modeMeta[mode.value])
const loadingHints: Record<Mode, string[]> = {
  suggest: [
    'Reading your goal',
    'Matching a template strategy',
    'Choosing parameter values',
    'Preparing editable request',
  ],
  compose: [
    'Reading strategy rules',
    'Compiling indicator logic',
    'Validating DSL structure',
    'Preparing runnable strategy',
  ],
}

const activePrompt = computed({
  get: () => (mode.value === 'suggest' ? promptSuggest.value : promptCompose.value),
  set: (v) => {
    if (mode.value === 'suggest') promptSuggest.value = v
    else promptCompose.value = v
  },
})

const loading = computed(() =>
  mode.value === 'suggest' ? ai.suggestLoading : ai.composeLoading,
)
const error = computed(() =>
  mode.value === 'suggest' ? ai.suggestError : ai.composeError,
)
const result = computed(() =>
  mode.value === 'suggest' ? ai.suggestResult : ai.composeResult,
)

const activeLoadingHint = computed(() => loadingHints[mode.value][hintIndex.value] ?? 'Thinking')

const previewJson = computed(() => {
  const r = result.value
  if (!r) return ''
  if (mode.value === 'suggest') {
    return JSON.stringify(
      { strategyId: r.request.strategyId, params: r.request.params },
      null,
      2,
    )
  }
  // compose result has a `dsl` field
  return JSON.stringify(
    (r as { dsl: unknown }).dsl,
    null,
    2,
  )
})

function baseFields() {
  return {
    symbol: props.symbol,
    startDate: props.startDate,
    endDate: props.endDate,
    initialCapital: props.initialCapital,
  }
}

async function submit(): Promise<void> {
  const text = activePrompt.value.trim()
  if (!text) return
  if (mode.value === 'suggest') {
    await ai.suggest({ prompt: text, ...baseFields() })
  } else {
    await ai.compose({ prompt: text, ...baseFields() })
  }
}

watch(loading, (next) => {
  if (hintTimer) {
    window.clearInterval(hintTimer)
    hintTimer = null
  }
  hintIndex.value = 0
  if (next) {
    hintTimer = window.setInterval(() => {
      hintIndex.value = (hintIndex.value + 1) % loadingHints[mode.value].length
    }, 1300)
  }
})

onBeforeUnmount(() => {
  if (hintTimer) window.clearInterval(hintTimer)
})

function applyResult(): void {
  const r = result.value
  if (!r) return
  emit('apply', r.request, mode.value)
}

function copyJson(): void {
  if (!previewJson.value) return
  void navigator.clipboard?.writeText(previewJson.value)
}

onMounted(() => void ai.loadProviders())
</script>

<template>
  <Card class="space-y-0 shadow-none border-[var(--tape-border)]">
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-2 min-w-0">
        <IconSparkles class="size-4 text-[var(--tape-info)]" />
        <CardTitle>AI Workbench</CardTitle>
        <span
          v-if="!ai.providersLoading && !ai.hasConfiguredProvider"
          class="text-[10px] text-[var(--tape-down)] tracking-wider uppercase"
          title="Set DEEPSEEK_API_KEY and restart the bridge"
        >
          API key missing
        </span>
      </div>
      <div class="flex items-center gap-1 rounded-xl border border-[var(--tape-border)] bg-[var(--tape-input)] p-1 text-xs">
        <Button
          v-for="m in (['suggest', 'compose'] as Mode[])"
          :key="m"
          size="xs"
          :variant="mode === m ? 'default' : 'ghost'"
          @click="mode = m"
        >
          {{ modeMeta[m].label }}
        </Button>
      </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-3">
      <p class="text-[11px] text-soft leading-relaxed">{{ activeMeta.hint }}</p>

    <Textarea
      v-model="activePrompt"
      :placeholder="activeMeta.placeholder"
      rows="2"
      class="resize-y"
      :disabled="loading"
    />

    <div class="flex items-center gap-3 flex-wrap">
      <Button
        size="xs"
        :disabled="loading || !activePrompt.trim() || !ai.hasConfiguredProvider"
        @click="submit"
      >
        <IconSparkles class="size-3" :class="loading && 'animate-pulse'" />
        {{ loading ? 'Thinking...' : activeMeta.cta }}
      </Button>
      <Alert
        v-if="error"
        variant="destructive"
        class="flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
      >
        <IconAlert class="size-3" />
        {{ error }}
      </Alert>
    </div>

    <div
      v-if="loading"
      class="rounded-lg border border-[var(--tape-border)] bg-[var(--tape-input)] px-3 py-2 space-y-2"
    >
      <div class="flex items-center gap-2 text-[11px] text-soft">
        <IconStreamlineFlexCriticalthinking2 class="size-3.5 text-[var(--tape-info)] animate-pulse opacity-80" />
        {{ activeLoadingHint }}
      </div>
      <div class="space-y-1.5">
        <div class="h-2 skeleton rounded-full w-5/6" />
        <div class="h-2 skeleton rounded-full w-3/4" />
      </div>
    </div>

    <!-- Result -->
    <section v-if="result" class="space-y-2 pt-1">
      <p
        v-if="result.rationale"
        class="text-xs text-soft leading-relaxed border-l-2 border-[var(--tape-info)] pl-2"
      >
        {{ result.rationale }}
      </p>
      <pre
        class="text-[11px] tabular-nums leading-snug bg-[var(--tape-input)] border border-[var(--tape-border)] rounded-md p-2 overflow-auto max-h-60"
      >{{ previewJson }}</pre>
      <div class="flex items-center gap-2">
        <Button size="xs" @click="applyResult">
          <IconPlay class="size-3" />
          {{ mode === 'suggest' ? 'Apply and run' : 'Run composed strategy' }}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          title="Copy JSON"
          @click="copyJson"
        >
          <IconCopy class="size-3" />
          Copy
        </Button>
      </div>
    </section>
    </CardContent>
  </Card>
</template>
