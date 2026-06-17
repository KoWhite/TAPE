import type {
  ComputeRequest,
  IndicatorCatalogResponse,
  IndicatorResult,
} from '@/types/indicator'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchIndicatorCatalog(): Promise<IndicatorCatalogResponse> {
  const res = await fetch(`${bridgeBase()}/indicators`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Indicators catalog: HTTP ${res.status}`)
  }
  return res.json()
}

export async function computeIndicator(
  req: ComputeRequest,
): Promise<IndicatorResult> {
  const res = await fetch(`${bridgeBase()}/indicator/compute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `Indicator compute: HTTP ${res.status}`)
  }
  return res.json()
}
