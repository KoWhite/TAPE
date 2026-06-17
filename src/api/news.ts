import type { NewsResponse } from '@/types/news'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export async function fetchTickerNews(code: string, limit = 20): Promise<NewsResponse> {
  const res = await fetch(`${bridgeBase()}/news/ticker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, limit }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `News (ticker): HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchMarketNews(): Promise<NewsResponse> {
  const res = await fetch(`${bridgeBase()}/news/market`, {
    method: 'GET',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `News (market): HTTP ${res.status}`)
  }
  return res.json()
}
