import type { AuType, KType, KlineResponse } from '@/types/kline'
import { useSettingsStore } from '@/stores/settings'

function bridgeBase(): string {
  const settings = useSettingsStore()
  return (settings.bridge.baseUrl || '/api').replace(/\/$/, '')
}

export interface FetchKlineOptions {
  code: string
  ktype?: KType
  count?: number
  autype?: AuType
}

export async function fetchKline(opts: FetchKlineOptions): Promise<KlineResponse> {
  const body = {
    code: opts.code,
    ktype: opts.ktype ?? 'K_DAY',
    count: opts.count ?? 250,
    autype: opts.autype ?? 'qfq',
  }
  const res = await fetch(`${bridgeBase()}/kline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `K-line ${opts.code}: HTTP ${res.status}`)
  }
  return res.json()
}

/**
 * Broker-agnostic OHLCV via the bridge's yfinance fallback. Use this
 * when the Futu bridge may be unavailable, e.g. in the Indicator Lab
 * where we want bars regardless of OpenD state.
 */
export async function fetchBars(opts: {
  code: string
  ktype?: KType
  count?: number
}): Promise<KlineResponse> {
  const body = {
    code: opts.code,
    ktype: opts.ktype ?? 'K_DAY',
    count: opts.count ?? 250,
  }
  const res = await fetch(`${bridgeBase()}/bars`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const data = await res.json()
      detail = data?.error || ''
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(detail || `Bars ${opts.code}: HTTP ${res.status}`)
  }
  return res.json()
}
