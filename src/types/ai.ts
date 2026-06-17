/**
 * AI gateway contracts (mirror of `server-py/ai/*`).
 *
 * The bridge keeps the model API key server-side and exposes a small
 * neutral surface — providers in /api/ai/providers, generic chat in
 * /api/ai/chat, and three backtest-specific endpoints:
 *
 *   /api/ai/backtest/explain  — narrative on an existing BacktestResult
 *   /api/ai/backtest/suggest  — NL → existing template strategy
 *   /api/ai/backtest/compose  — NL → DSL rule tree (executor: dsl)
 */
import type { BacktestRequest, BacktestResult } from './backtest'

// ── /api/ai/providers ─────────────────────────────────────────────────
export interface AiProviderInfo {
  id: string
  label: string
  baseUrl: string
  defaultModel: string
  models: string[]
  /** True iff the bridge can reach this provider — i.e. the key env var
   *  is set. The frontend dims the UI when no provider is configured. */
  configured: boolean
}

export interface AiProviderListResponse {
  defaultProvider: string
  /** True iff TAVILY_API_KEY is set on the bridge — controls whether the
   *  `enableWebSearch` flag on chat requests does anything. */
  webSearchConfigured?: boolean
  providers: AiProviderInfo[]
}

// ── /api/ai/chat (raw passthrough) ────────────────────────────────────
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
}

export interface AiChatRequest {
  provider?: string
  model?: string
  messages: AiChatMessage[]
  temperature?: number
  topP?: number
  maxTokens?: number
  json?: boolean
  /** When true, the bridge exposes a `search_web` tool (Tavily) the model
   *  can call to fetch fresh information. Only meaningful when the bridge
   *  has TAVILY_API_KEY configured — otherwise silently ignored. */
  enableWebSearch?: boolean
}

export interface AiChatResponse {
  provider: string
  model: string
  id?: string
  created?: number
  content: string
  message?: AiChatMessage
  finishReason?: string
  usage?: Record<string, number>
}

// ── /api/ai/backtest/explain ──────────────────────────────────────────
export interface AiExplainRequest {
  result: BacktestResult
  model?: string
  extraInstruction?: string
}

export interface AiExplainResponse {
  /** Markdown narrative — render with a markdown component or as plain
   *  text inside <pre>; we don't want to ship a heavy markdown parser
   *  just for this. */
  content: string
  model?: string
  provider?: string
  usage?: Record<string, number>
}

// ── /api/ai/backtest/suggest ──────────────────────────────────────────
export interface AiSuggestRequest {
  prompt: string
  symbol?: string
  startDate?: string
  endDate?: string
  initialCapital?: number
  model?: string
}

export interface AiSuggestResponse {
  strategyId: string
  params: Record<string, number>
  rationale: string
  /** Ready-to-submit BacktestRequest — frontend just hands this to
   *  `useBacktestsStore().run()`. */
  request: BacktestRequest
  model?: string
  provider?: string
  usage?: Record<string, number>
}

// ── /api/ai/backtest/compose ──────────────────────────────────────────
/** Operand for the DSL rule tree — see server-py/backtests/strategies/dsl.py. */
export type DslOperand =
  | number
  | 'open' | 'high' | 'low' | 'close' | 'volume'
  | { indicator: string; params?: Record<string, number>; output?: string }

export type DslOp =
  | '<' | '<=' | '>' | '>=' | '==' | '!='
  | 'cross_above' | 'cross_below'

export type DslCondition =
  | { all: DslCondition[] }
  | { any: DslCondition[] }
  | { left: DslOperand; op: DslOp; right: DslOperand }

export interface Dsl {
  name?: string
  entry: DslCondition
  exit: DslCondition
  indicators_to_chart?: DslOperand[]
}

export interface AiComposeRequest {
  prompt: string
  symbol?: string
  startDate?: string
  endDate?: string
  initialCapital?: number
  model?: string
}

export interface AiComposeResponse {
  dsl: Dsl
  rationale: string
  /** Ready-to-submit BacktestRequest with strategyId='dsl' and
   *  params.dsl=<Dsl>. */
  request: BacktestRequest
  model?: string
  provider?: string
  usage?: Record<string, number>
}
