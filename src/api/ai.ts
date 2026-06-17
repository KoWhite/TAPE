/**
 * Frontend AI client — talks only to the bridge (`/api/ai/*`), never to
 * DeepSeek directly. The key lives server-side; the browser only sees
 * narrative text + structured BacktestRequest objects.
 */
import { useSettingsStore } from '@/stores/settings'
import type {
  AiChatRequest,
  AiChatResponse,
  AiComposeRequest,
  AiComposeResponse,
  AiExplainRequest,
  AiExplainResponse,
  AiProviderListResponse,
  AiSuggestRequest,
  AiSuggestResponse,
} from '@/types/ai'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${bridgeBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `${path}: HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchAiProviders(): Promise<AiProviderListResponse> {
  const res = await fetch(`${bridgeBase()}/ai/providers`)
  if (!res.ok) throw new Error(`AI providers: HTTP ${res.status}`)
  return res.json()
}

export function aiChat(req: AiChatRequest): Promise<AiChatResponse> {
  return postJson('/ai/chat', req)
}

export interface AiChatStreamHandlers {
  onDelta: (content: string) => void
  /** Fired with `reasoning_content` deltas from thinking-mode models
   *  (e.g. DeepSeek's reasoner). Optional — non-reasoning models never
   *  call it. Use to surface the chain-of-thought while the final answer
   *  is still being computed. */
  onReasoning?: (content: string) => void
  onFinish?: (finishReason?: string) => void
}

export async function aiChatStream(
  req: AiChatRequest,
  handlers: AiChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamJson('/ai/chat/stream', req, handlers, signal)
}

async function streamJson(
  path: string,
  body: unknown,
  handlers: AiChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${bridgeBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `${path}: HTTP ${res.status}`)
  }
  if (!res.body) throw new Error('AI stream response has no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  function handleEvent(raw: string): void {
    const line = raw
      .split('\n')
      .map((x) => x.trim())
      .find((x) => x.startsWith('data:'))
    if (!line) return
    const json = line.slice(5).trim()
    if (!json) return
    const event = JSON.parse(json) as {
      type?: string
      content?: string
      error?: string
      finishReason?: string
    }
    if (event.type === 'delta' && event.content) handlers.onDelta(event.content)
    if (event.type === 'reasoning' && event.content) handlers.onReasoning?.(event.content)
    if (event.type === 'finish') handlers.onFinish?.(event.finishReason)
    if (event.type === 'done') handlers.onFinish?.()
    if (event.type === 'error') throw new Error(event.error || 'AI stream failed')
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) handleEvent(part)
  }
  buffer += decoder.decode()
  if (buffer.trim()) handleEvent(buffer)
}

export function aiExplainBacktest(
  req: AiExplainRequest,
): Promise<AiExplainResponse> {
  return postJson('/ai/backtest/explain', req)
}

export function aiExplainBacktestStream(
  req: AiExplainRequest,
  handlers: AiChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamJson('/ai/backtest/explain/stream', req, handlers, signal)
}

export function aiSuggestBacktest(
  req: AiSuggestRequest,
): Promise<AiSuggestResponse> {
  return postJson('/ai/backtest/suggest', req)
}

export function aiComposeBacktest(
  req: AiComposeRequest,
): Promise<AiComposeResponse> {
  return postJson('/ai/backtest/compose', req)
}

export type AiActionType = 'buy' | 'sell' | 'hold' | 'trim' | 'stop_loss' | 'take_profit'

export interface AiActionPosition {
  code: string
  symbol: string
  shares?: number
  avgCost?: number
  last?: number
  pnl?: number
  pnlPct?: number
  weight?: number
  targetWeight?: number
  takeProfitPrice?: number
  stopLossPrice?: number
  news?: { title: string; source?: string; publishedAt?: string }[]
  notes?: string
}

export interface AiActionRequest {
  positions: AiActionPosition[]
  /** Advisory — affects the prompt only (LLM is told whether this is a
   *  single-symbol or portfolio-wide context). */
  mode?: 'symbol' | 'portfolio'
  model?: string
  temperature?: number
}

export interface AiActionItem {
  code: string
  symbol: string
  action: AiActionType
  confidence: number
  rationale: string
  suggestedShares: number | null
  suggestedPrice: number | null
}

export interface AiActionResponse {
  headline: string
  actions: AiActionItem[]
  model?: string
  provider?: string
}

export function aiSuggestActions(req: AiActionRequest): Promise<AiActionResponse> {
  return postJson('/ai/actions', req)
}

export type MacroAiTone = 'bullish' | 'bearish' | 'neutral' | 'caution'

export interface MacroAiMetric {
  label: string
  value: number | null
  unit?: string
  note?: string
}

export interface MacroAiSnapshot {
  id: string
  label: string
  description: string
  asOf?: string
  metrics: MacroAiMetric[]
}

export interface MacroAiAnalyzeRequest {
  snapshots: MacroAiSnapshot[]
  model?: string
  temperature?: number
}

export interface MacroAiObservation {
  id: string
  title: string
  body: string
  cites: string[]
  tone: MacroAiTone
}

export interface MacroAiResponse {
  regime: { label: string; tone: MacroAiTone }
  headline: string
  observations: MacroAiObservation[]
  risks: string[]
  asOf?: string | null
  model?: string
  provider?: string
}

export function aiAnalyzeMacro(req: MacroAiAnalyzeRequest): Promise<MacroAiResponse> {
  return postJson('/ai/macro/analyze', req)
}
