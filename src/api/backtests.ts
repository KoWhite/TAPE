import type {
  BacktestCatalogResponse,
  BacktestRequest,
  BacktestResult,
} from '@/types/backtest'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchBacktestCatalog(): Promise<BacktestCatalogResponse> {
  const res = await fetch(`${bridgeBase()}/backtests`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Backtest catalog: HTTP ${res.status}`)
  }
  return res.json()
}

export async function runBacktest(
  req: BacktestRequest,
): Promise<BacktestResult> {
  const res = await fetch(`${bridgeBase()}/backtest/run`, {
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
    throw new Error(detail || `Backtest run: HTTP ${res.status}`)
  }
  return res.json()
}
