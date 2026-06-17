/**
 * Natural-language stock screener. Two-step:
 *   1. compile(prompt)  → structured filter set (LLM call only, ~1-2s)
 *   2. run(filters, universe) → evaluate against bars (heavier, depends on universe size)
 *
 * The split lets the UI show the compiled filters before the user
 * commits to a potentially slow universe scan.
 */
import { useSettingsStore } from '@/stores/settings'

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

export type ScreenerOp = '<' | '<=' | '>' | '>=' | '==' | '!='

export interface ScreenerFilter {
  metric: string
  op: ScreenerOp
  value: number
  params: Record<string, number>
}

export interface ScreenerCompileResponse {
  name: string
  rationale: string
  filters: ScreenerFilter[]
  model?: string
  provider?: string
}

export interface ScreenerMatch {
  code: string
  last: number
  metrics: Record<string, number>
}

export interface ScreenerRunResponse {
  filters: ScreenerFilter[]
  matches: ScreenerMatch[]
  skipped: { code: string; reason: string }[]
  scanned: number
}

export function compileScreen(prompt: string): Promise<ScreenerCompileResponse> {
  return postJson('/screener/compile', { prompt })
}

export function runScreen(
  filters: ScreenerFilter[],
  universe: string[],
): Promise<ScreenerRunResponse> {
  return postJson('/screener/run', { filters, universe })
}
