import type { SectorResponse } from '@/types/sector'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchSectors(codes: string[]): Promise<SectorResponse> {
  if (codes.length === 0) {
    return { available: true, results: {}, cachedAt: new Date().toISOString() }
  }
  const res = await fetch(`${bridgeBase()}/sectors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Sectors: HTTP ${res.status}`)
  }
  return res.json()
}
