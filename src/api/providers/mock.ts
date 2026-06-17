import type { Quote, ConnectionStatus } from '@/types/stock'
import type { QuoteProvider } from '@/api/types'

/**
 * Deterministic-ish mock provider — drifts prices with a seeded RNG so the
 * dashboard feels alive without a backend. Replace with the Futu adapter once
 * you have OpenD running.
 */

const SEED_PRICES: Record<string, { name: string; base: number; vol: number }> = {
  'US.AAPL': { name: 'Apple Inc.', base: 228.4, vol: 0.012 },
  'US.NVDA': { name: 'NVIDIA Corp.', base: 142.7, vol: 0.028 },
  'US.TSLA': { name: 'Tesla Inc.', base: 246.1, vol: 0.034 },
  'US.MSFT': { name: 'Microsoft Corp.', base: 425.6, vol: 0.011 },
  'US.GOOGL': { name: 'Alphabet Inc.', base: 178.9, vol: 0.014 },
  'US.AMZN': { name: 'Amazon.com Inc.', base: 198.4, vol: 0.016 },
  'US.META': { name: 'Meta Platforms', base: 612.5, vol: 0.018 },
  'US.AMD': { name: 'Advanced Micro Devices', base: 138.2, vol: 0.029 },
  'US.SPY': { name: 'SPDR S&P 500 ETF', base: 581.3, vol: 0.006 },
  'US.QQQ': { name: 'Invesco QQQ Trust', base: 506.8, vol: 0.009 },
  'US.AVGO': { name: 'Broadcom Inc.', base: 178.4, vol: 0.022 },
  'US.NFLX': { name: 'Netflix Inc.', base: 868.9, vol: 0.018 },
}

interface CachedQuote extends Quote {
  history: number[]
}

const cache = new Map<string, CachedQuote>()

function gauss(): number {
  // Box-Muller — softer tails than uniform random walk.
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function buildHistory(base: number, vol: number, points = 48): number[] {
  let p = base * (1 + (Math.random() - 0.5) * vol * 4)
  const arr: number[] = []
  for (let i = 0; i < points; i++) {
    p = p * (1 + gauss() * vol * 0.4)
    arr.push(Number(p.toFixed(3)))
  }
  return arr
}

function makeQuote(code: string): CachedQuote {
  const seed = SEED_PRICES[code] ?? {
    name: code.replace(/^US\./, ''),
    base: 50 + Math.random() * 200,
    vol: 0.02,
  }
  const history = buildHistory(seed.base, seed.vol)
  const last = history[history.length - 1]
  const prevClose = seed.base
  const change = last - prevClose
  const changePct = change / prevClose
  const symbol = code.replace(/^US\./, '')
  const high = Math.max(...history)
  const low = Math.min(...history)
  const open = history[0]
  const volume = Math.floor(1_500_000 + Math.random() * 30_000_000)
  return {
    code,
    symbol,
    name: seed.name,
    market: 'US',
    type: code.includes('SPY') || code.includes('QQQ') ? 'ETF' : 'STOCK',
    last: Number(last.toFixed(3)),
    prevClose: Number(prevClose.toFixed(3)),
    change: Number(change.toFixed(3)),
    changePct: Number(changePct.toFixed(5)),
    open: Number(open.toFixed(3)),
    high: Number(high.toFixed(3)),
    low: Number(low.toFixed(3)),
    volume,
    turnover: Math.floor(volume * last),
    updatedAt: new Date().toISOString(),
    history,
    currency: 'USD',
  }
}

function tick(q: CachedQuote): CachedQuote {
  const seed = SEED_PRICES[q.code]
  const vol = seed?.vol ?? 0.02
  const drift = gauss() * vol * 0.18
  const last = Math.max(0.01, q.last * (1 + drift))
  const change = last - q.prevClose
  const history = [...q.history.slice(1), Number(last.toFixed(3))]
  return {
    ...q,
    last: Number(last.toFixed(3)),
    change: Number(change.toFixed(3)),
    changePct: Number((change / q.prevClose).toFixed(5)),
    high: Math.max(q.high, last),
    low: Math.min(q.low, last),
    history,
    updatedAt: new Date().toISOString(),
  }
}

export const mockProvider: QuoteProvider = {
  id: 'mock',

  async fetchQuotes(codes, _signal) {
    // Mock returns synchronously — no need to honour the AbortSignal.
    return codes.map((code) => {
      const existing = cache.get(code)
      const next = existing ? tick(existing) : makeQuote(code)
      cache.set(code, next)
      return next
    })
  },

  subscribe(codes, onTick) {
    let active = true
    const interval = window.setInterval(() => {
      if (!active) return
      for (const code of codes) {
        const existing = cache.get(code) ?? makeQuote(code)
        const next = tick(existing)
        cache.set(code, next)
        onTick(next)
      }
    }, 1500)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  },

  async searchSymbols(query) {
    const q = query.trim().toUpperCase()
    if (!q) return []
    const seeded = Object.entries(SEED_PRICES)
      .filter(([code, v]) => code.includes(q) || v.name.toUpperCase().includes(q))
      .map(([code, v]) => ({
        code,
        symbol: code.replace(/^US\./, ''),
        name: v.name,
      }))
    if (seeded.length > 0) return seeded.slice(0, 8)
    return [{ code: `US.${q}`, symbol: q, name: q }]
  },

  async status(): Promise<ConnectionStatus> {
    return { connected: true, source: 'mock', latencyMs: 0 }
  },
}
