import type { SectorEtfResponse } from '@/types/marketSector'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

/** GET the 11 SPDR sector ETF quotes from the bridge. The bridge caches
 *  for 60s, so polling cheaper than every minute just hits the cache. */
export async function fetchSectorEtfs(): Promise<SectorEtfResponse> {
  const res = await fetch(`${bridgeBase()}/market/sector-etfs`, { method: 'GET' })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `Sector ETFs: HTTP ${res.status}`)
  }
  return res.json()
}
