import { useSettingsStore } from '@/stores/settings'

export type AppStateKey =
  | 'watchlist'
  | 'portfolio'
  | 'portfolioHistory'
  | 'alerts'
  | 'backtestPresets'
  | 'earnings'
  | 'macro'
  | 'fearGreed'
  | 'polymarket'
  | 'sectors'
  | 'aiDailyBrief'
  | 'stockAiAnalysis'

export type AppStatePatch = Partial<Record<AppStateKey, unknown>>

export interface AppStateResponse {
  dbPath?: string
  dbSizeBytes?: number
  stateKeys?: string[]
  lastUpdatedAt?: string | null
  updatedAt?: string
  state: AppStatePatch
}

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchAppState(): Promise<AppStateResponse> {
  const res = await fetch(`${bridgeBase()}/app-state`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `App state: HTTP ${res.status}`)
  }
  return res.json()
}

export async function saveAppState(
  state: AppStatePatch,
  opts: { replace?: boolean } = {},
): Promise<AppStateResponse> {
  const res = await fetch(`${bridgeBase()}/app-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, replace: opts.replace }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `App state save: HTTP ${res.status}`)
  }
  return res.json()
}

/** Server-side cache_entries table — distinct from app_state. Used for
 *  bridge-owned caches like bars and indicator results. Optional `prefix`
 *  scopes the wipe to a key family (e.g. "bars:" or "indicator:"). */
export async function clearServerCache(
  prefix?: string,
): Promise<{ removed: number; prefix: string | null }> {
  const res = await fetch(`${bridgeBase()}/cache/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefix ? { prefix } : {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Cache clear: HTTP ${res.status}`)
  }
  return res.json()
}
