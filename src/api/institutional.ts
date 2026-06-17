import type { InstitutionalContext } from '@/types/institutional'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchInstitutionalContext(code: string): Promise<InstitutionalContext> {
  const res = await fetch(`${bridgeBase()}/institutional/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Institutional context: HTTP ${res.status}`)
  }
  return res.json()
}
