import type { FearGreed } from '@/types/fearGreed'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

/** GET the CNN Fear & Greed payload from the bridge. The bridge caches for
 *  5 minutes so repeated calls are cheap; failure surfaces as a thrown
 *  Error with the bridge's message. */
export async function fetchFearGreed(): Promise<FearGreed> {
  const res = await fetch(`${bridgeBase()}/cnn/fear-greed`, { method: 'GET' })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `Fear & Greed: HTTP ${res.status}`)
  }
  return res.json()
}
