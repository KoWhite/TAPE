import type { PolymarketTop } from '@/types/polymarket'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

/** GET top Polymarket events by 24h volume from the bridge. */
export async function fetchPolymarketTop(): Promise<PolymarketTop> {
  const res = await fetch(`${bridgeBase()}/polymarket/top`, { method: 'GET' })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `Polymarket: HTTP ${res.status}`)
  }
  return res.json()
}
