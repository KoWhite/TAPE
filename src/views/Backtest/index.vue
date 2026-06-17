<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import BacktestAiPanel from './components/BacktestAiPanel.vue'
import BacktestPicker from './components/BacktestPicker.vue'
import { useAiStore } from '@/stores/ai'
import { useBacktestsStore } from '@/stores/backtests'
import { useBacktestPresetsStore, type BacktestPreset } from '@/stores/backtestPresets'
import type { BacktestParamValue, BacktestRequest } from '@/types/backtest'
import BacktestConfigPanel from './components/BacktestConfigPanel.vue'
import BacktestErrorBanner from './components/BacktestErrorBanner.vue'
import BacktestHeader from './components/BacktestHeader.vue'
import BacktestLoadingState from './components/BacktestLoadingState.vue'
import BacktestPresetsPanel from './components/BacktestPresetsPanel.vue'
import BacktestResultPanels from './components/BacktestResultPanels.vue'

const store = useBacktestsStore()
const ai = useAiStore()
const presetsStore = useBacktestPresetsStore()
const route = useRoute()
const { catalog, lastError } = storeToRefs(store)
const { presets } = storeToRefs(presetsStore)

const strategyId = ref<string>('buy_hold')
const symbol = ref<string>('US.AAPL')
const symbolInput = ref<string>(symbol.value)
const startDate = ref<string>(defaultStart())
const endDate = ref<string>(defaultEnd())
const initialCapital = ref<number>(10_000)
const params = ref<Record<string, BacktestParamValue>>({})
const submittedRequest = ref<BacktestRequest | null>(null)

function defaultStart(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

function defaultEnd(): string {
  return new Date().toISOString().slice(0, 10)
}

const meta = computed(() => store.meta(strategyId.value))

function selectStrategy(id: string): void {
  strategyId.value = id
  const m = store.meta(id)
  const next: Record<string, BacktestParamValue> = {}
  for (const p of m?.params ?? []) next[p.name] = p.default
  params.value = next
}

const numericParams = computed<Record<string, number>>({
  get: () => {
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(params.value)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    }
    return out
  },
  set: (value) => {
    const nonNumeric = Object.fromEntries(
      Object.entries(params.value).filter(([, v]) => typeof v !== 'number'),
    )
    params.value = { ...nonNumeric, ...value }
  },
})

watch(
  () => catalog.value.length,
  () => {
    if (catalog.value.length && !Object.keys(params.value).length) {
      selectStrategy(strategyId.value)
    }
  },
  { immediate: true },
)

onMounted(() => {
  void store.loadCatalog()
  void ai.loadProviders()
  applyRouteSeed()
})

function applySymbol(): void {
  const next = symbolInput.value.trim().toUpperCase()
  if (!next || next === symbol.value) return
  symbol.value = next.includes('.') ? next : `US.${next}`
  symbolInput.value = symbol.value
}

const currentRequest = computed<BacktestRequest>(() => ({
  strategyId: strategyId.value,
  universe: [symbol.value],
  startDate: startDate.value,
  endDate: endDate.value,
  initialCapital: initialCapital.value,
  params: { ...params.value },
}))

const displayRequest = computed(() => submittedRequest.value ?? currentRequest.value)
const result = computed(() => store.get(displayRequest.value))
const isRunning = computed(() => store.loadingFor(displayRequest.value))

watch(result, (next, prev) => {
  if (next !== prev) ai.resetExplain()
})

async function runNow(force = false): Promise<void> {
  applySymbol()
  if (configError.value || !strategyId.value || !symbol.value) return
  ai.resetExplain()
  submittedRequest.value = currentRequest.value
  await store.run(submittedRequest.value, force)
}

function normalizeAiRequest(req: BacktestRequest): BacktestRequest {
  return {
    strategyId: req.strategyId,
    universe: req.universe?.length ? req.universe : [symbol.value],
    startDate: req.startDate ?? startDate.value,
    endDate: req.endDate ?? endDate.value,
    initialCapital: req.initialCapital ?? initialCapital.value,
    params: req.params ?? {},
  }
}

async function applyAiRequest(req: BacktestRequest, mode?: 'suggest' | 'compose'): Promise<void> {
  const next = normalizeAiRequest(req)
  strategyId.value = next.strategyId
  symbol.value = next.universe[0] ?? symbol.value
  symbolInput.value = symbol.value
  startDate.value = next.startDate ?? startDate.value
  endDate.value = next.endDate ?? endDate.value
  initialCapital.value = next.initialCapital ?? initialCapital.value
  params.value = { ...(next.params ?? {}) }
  ai.resetExplain()
  await nextTick()
  submittedRequest.value = mode === 'compose' ? next : currentRequest.value
  await store.run(submittedRequest.value, true)
}

function applyRouteSeed(): void {
  const rawSymbol = typeof route.query.symbol === 'string' ? route.query.symbol : ''
  if (!rawSymbol) return
  const nextSymbol = rawSymbol.trim().toUpperCase()
  if (!nextSymbol) return
  const strategy = typeof route.query.strategy === 'string' ? route.query.strategy : 'buy_hold'
  const initial = Number(route.query.initialCapital)
  const start = typeof route.query.startDate === 'string' ? route.query.startDate : ''
  const end = typeof route.query.endDate === 'string' ? route.query.endDate : ''
  const rawDsl = typeof route.query.dsl === 'string' ? route.query.dsl : ''

  strategyId.value = strategy
  symbol.value = nextSymbol.includes('.') ? nextSymbol : `US.${nextSymbol}`
  symbolInput.value = symbol.value
  if (Number.isFinite(initial) && initial > 0) initialCapital.value = initial
  if (start) startDate.value = start
  if (end) endDate.value = end
  if (rawDsl) {
    try {
      params.value = { dsl: JSON.parse(rawDsl) }
    } catch {
      params.value = {}
    }
  } else {
    params.value = {}
  }
  void nextTick().then(() => runNow(true))
}

function savePreset(name: string): void {
  presetsStore.save(name, currentRequest.value)
}

function applyPreset(preset: BacktestPreset): void {
  const next = normalizeAiRequest(preset.request)
  strategyId.value = next.strategyId
  symbol.value = next.universe[0] ?? symbol.value
  symbolInput.value = symbol.value
  startDate.value = next.startDate ?? startDate.value
  endDate.value = next.endDate ?? endDate.value
  initialCapital.value = next.initialCapital ?? initialCapital.value
  params.value = { ...(next.params ?? {}) }
  submittedRequest.value = null
  ai.resetExplain()
}

async function explainNow(): Promise<void> {
  if (!result.value || ai.explainLoading || !ai.hasConfiguredProvider) return
  await ai.explainStream({ result: result.value })
}

watch(
  [() => catalog.value.length, () => Object.keys(params.value).length],
  () => {
    if (catalog.value.length && Object.keys(params.value).length && !result.value) {
      void runNow(false)
    }
  },
  { immediate: true },
)

const elapsedLabel = computed(() => {
  const ms = result.value?.meta.elapsedMs
  return ms != null ? `${ms} ms` : null
})

const barsLabel = computed(() => {
  const n = result.value?.meta.barsAnalyzed
  return n != null ? `${n} bars` : null
})

const composedDslJson = computed(() => {
  if (strategyId.value !== 'dsl' || !params.value.dsl) return ''
  return JSON.stringify(params.value.dsl, null, 2)
})

const configError = computed(() => {
  const code = symbolInput.value.trim()
  if (!code) return 'Symbol is required.'
  if (!startDate.value || !endDate.value) return 'Start and end dates are required.'
  if (startDate.value > endDate.value) return 'Start date must be before end date.'
  if (!Number.isFinite(initialCapital.value) || initialCapital.value < 100) {
    return 'Initial capital must be at least 100.'
  }
  if (!meta.value) return 'Strategy catalog is not ready yet.'
  return null
})
</script>

<template>
  <div class="space-y-5">
    <BacktestHeader :is-running="isRunning" @rerun="runNow(true)" />

    <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-3 sm:gap-4">
      <article class="surface p-4 sm:p-5 space-y-4">
        <header class="flex items-center gap-2">
          <h3 class="text-sm font-semibold tracking-tight">Strategy</h3>
          <span class="text-[10px] text-soft tracking-wider uppercase">
            pick one
          </span>
        </header>
        <BacktestPicker :selected="strategyId" @select="selectStrategy" />
      </article>

      <BacktestConfigPanel
        :meta="meta"
        v-model:symbol-input="symbolInput"
        v-model:initial-capital="initialCapital"
        v-model:start-date="startDate"
        v-model:end-date="endDate"
        :numeric-params="numericParams"
        :composed-dsl-json="composedDslJson"
        :is-running="isRunning"
        :validation-error="configError"
        @update:numeric-params="numericParams = $event"
        @apply-symbol="applySymbol"
        @run="runNow(true)"
      >
        <template #meta>
          <span
            v-if="elapsedLabel"
            class="text-[11px] text-soft inline-flex items-center gap-1"
          >
            <IconLucideClock class="size-3" />
            {{ elapsedLabel }} - {{ barsLabel }}
          </span>
        </template>
      </BacktestConfigPanel>
    </div>

    <BacktestPresetsPanel
      :presets="presets"
      @save="savePreset"
      @apply="applyPreset"
      @delete="presetsStore.remove"
    />

    <BacktestAiPanel
      :symbol="symbol"
      :start-date="startDate"
      :end-date="endDate"
      :initial-capital="initialCapital"
      @apply="applyAiRequest"
    />

    <BacktestErrorBanner
      v-if="lastError"
      :error="lastError"
      @retry="runNow(true)"
    />

    <template v-if="result">
      <BacktestResultPanels
        :result="result"
        :providers-loading="ai.providersLoading"
        :has-configured-provider="ai.hasConfiguredProvider"
        :explain-loading="ai.explainLoading"
        :explain-error="ai.explainError"
        :explain-content="ai.explainResult?.content ?? null"
        @explain="explainNow"
      />
    </template>

    <template v-else-if="isRunning">
      <BacktestLoadingState />
    </template>

    <article
      v-else-if="!isRunning && !lastError"
      class="surface p-12 text-center text-sm text-soft"
    >
      Pick a strategy and hit Run to see results.
    </article>
  </div>
</template>
