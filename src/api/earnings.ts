import type { EarningsBatchResponse } from '@/types/earnings'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchEarnings(codes: string[]): Promise<EarningsBatchResponse> {
  if (codes.length === 0) return { available: true, results: {} }
  const res = await fetch(`${bridgeBase()}/earnings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `Earnings: HTTP ${res.status}`)
  }
  return res.json()
}
