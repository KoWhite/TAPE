import { defineStore } from 'pinia'
import {
  aiComposeBacktest,
  aiExplainBacktest,
  aiExplainBacktestStream,
  aiSuggestBacktest,
  fetchAiProviders,
} from '@/api/ai'
import type {
  AiComposeRequest,
  AiComposeResponse,
  AiExplainRequest,
  AiExplainResponse,
  AiProviderListResponse,
  AiSuggestRequest,
  AiSuggestResponse,
} from '@/types/ai'

/**
 * Single store covering all three AI-backtest interaction modes.
 *
 * Each mode keeps its own (loading, error, last result) tuple — running
 * Suggest while an Explain is in flight should not blank out the
 * Explain panel. Results aren't persisted: re-running with the same
 * prompt is cheap and the LLM output isn't deterministic anyway.
 */
export const useAiStore = defineStore('ai', () => {
  // ── providers ────────────────────────────────────────────────────────
  const providers = ref<AiProviderListResponse | null>(null)
  const providersLoading = ref(false)
  const providersError = ref<string | null>(null)

  async function loadProviders(force = false): Promise<void> {
    if (!force && providers.value) return
    if (providersLoading.value) return
    providersLoading.value = true
    providersError.value = null
    try {
      providers.value = await fetchAiProviders()
    } catch (e) {
      providersError.value = (e as Error).message
    } finally {
      providersLoading.value = false
    }
  }

  /** True iff at least one provider has its API key configured server-
   *  side. The Backtest view uses this to dim the AI buttons rather
   *  than letting the user click and hit a runtime error. */
  const hasConfiguredProvider = computed(() =>
    !!providers.value?.providers.some((p) => p.configured),
  )

  /** True iff TAVILY_API_KEY is set on the bridge. Surfaces the Web
   *  Search badge/toggle in views that opt the model into live search. */
  const webSearchConfigured = computed(() => !!providers.value?.webSearchConfigured)

  // ── explain ──────────────────────────────────────────────────────────
  const explainResult = ref<AiExplainResponse | null>(null)
  const explainLoading = ref(false)
  const explainError = ref<string | null>(null)

  async function explain(req: AiExplainRequest): Promise<AiExplainResponse | null> {
    explainLoading.value = true
    explainError.value = null
    try {
      const res = await aiExplainBacktest(req)
      explainResult.value = res
      return res
    } catch (e) {
      explainError.value = (e as Error).message
      return null
    } finally {
      explainLoading.value = false
    }
  }

  async function explainStream(req: AiExplainRequest): Promise<AiExplainResponse | null> {
    explainLoading.value = true
    explainError.value = null
    explainResult.value = { content: '' }
    let streamed = false
    let content = ''
    try {
      await aiExplainBacktestStream(req, {
        onDelta(delta) {
          streamed = true
          content += delta
          explainResult.value = { content }
        },
        onFinish() {
          explainResult.value = { content }
        },
      })
      return explainResult.value
    } catch (e) {
      if (streamed) {
        explainError.value = (e as Error).message
        return null
      }
      return explain(req)
    } finally {
      explainLoading.value = false
    }
  }

  function resetExplain(): void {
    explainResult.value = null
    explainError.value = null
  }

  // ── suggest ──────────────────────────────────────────────────────────
  const suggestResult = ref<AiSuggestResponse | null>(null)
  const suggestLoading = ref(false)
  const suggestError = ref<string | null>(null)

  async function suggest(req: AiSuggestRequest): Promise<AiSuggestResponse | null> {
    suggestLoading.value = true
    suggestError.value = null
    try {
      const res = await aiSuggestBacktest(req)
      suggestResult.value = res
      return res
    } catch (e) {
      suggestError.value = (e as Error).message
      return null
    } finally {
      suggestLoading.value = false
    }
  }

  function resetSuggest(): void {
    suggestResult.value = null
    suggestError.value = null
  }

  // ── compose ──────────────────────────────────────────────────────────
  const composeResult = ref<AiComposeResponse | null>(null)
  const composeLoading = ref(false)
  const composeError = ref<string | null>(null)

  async function compose(req: AiComposeRequest): Promise<AiComposeResponse | null> {
    composeLoading.value = true
    composeError.value = null
    try {
      const res = await aiComposeBacktest(req)
      composeResult.value = res
      return res
    } catch (e) {
      composeError.value = (e as Error).message
      return null
    } finally {
      composeLoading.value = false
    }
  }

  function resetCompose(): void {
    composeResult.value = null
    composeError.value = null
  }

  return {
    // providers
    providers,
    providersLoading,
    providersError,
    hasConfiguredProvider,
    webSearchConfigured,
    loadProviders,
    // explain
    explainResult,
    explainLoading,
    explainError,
    explain,
    explainStream,
    resetExplain,
    // suggest
    suggestResult,
    suggestLoading,
    suggestError,
    suggest,
    resetSuggest,
    // compose
    composeResult,
    composeLoading,
    composeError,
    compose,
    resetCompose,
  }
})
