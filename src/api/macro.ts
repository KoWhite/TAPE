import type { MacroSeries, TacoIndex } from '@/types/macro'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

async function postMacro<T>(path: string, body: unknown, label: string): Promise<T> {
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
    throw new Error(detail || `${label}: HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Fetch a FRED series via the bridge. Always hits the bridge regardless of
 * the Mock/Bridge data-source toggle — macro data has no mock equivalent.
 * If the bridge isn't running or FRED_API_KEY is unset, the call rejects
 * with a useful message.
 */
export function fetchFredSeries(seriesId: string, start?: string): Promise<MacroSeries> {
  return postMacro<MacroSeries>('/fred/series', { seriesId, start }, `FRED ${seriesId}`)
}

/**
 * Fetch the Shiller CAPE (cyclically-adjusted P/E) series — sourced from
 * multpl.com via the bridge. Same MacroSeries shape as FRED so all chart
 * infrastructure works unchanged.
 */
export function fetchShillerCape(): Promise<MacroSeries> {
  return postMacro<MacroSeries>('/shiller/cape', {}, 'Shiller CAPE')
}

export function fetchBuffettIndicator(start?: string): Promise<MacroSeries> {
  return postMacro<MacroSeries>('/macro/buffett-indicator', { start }, 'Buffett Indicator')
}

export function fetchTacoIndex(window = 20, start?: string): Promise<TacoIndex> {
  return postMacro<TacoIndex>('/macro/taco', { window, start }, 'TACO Index')
}
