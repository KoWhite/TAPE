import type { AnalystResponse } from '@/types/analyst'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchAnalyst(code: string): Promise<AnalystResponse> {
  const res = await fetch(`${bridgeBase()}/analyst`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Analyst: HTTP ${res.status}`)
  }
  return res.json()
}
