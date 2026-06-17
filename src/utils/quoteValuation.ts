import type { Quote, SessionKind } from '@/types/stock'

export interface QuoteValuation {
  price: number
  change: number
  changePct: number
  source: 'regular' | SessionKind
}

const SESSION_ORDER: SessionKind[] = ['overnight', 'afterHours', 'preMarket']

export function getQuoteValuation(quote: Quote | undefined | null): QuoteValuation | null {
  if (!quote) return null
  for (const kind of SESSION_ORDER) {
    const session = quote.sessions?.[kind]
    if (session && session.price > 0) {
      return {
        price: session.price,
        change: session.change,
        changePct: session.changePct,
        source: kind,
      }
    }
  }
  if (quote.last <= 0) return null
  return {
    price: quote.last,
    change: quote.change,
    changePct: quote.changePct,
    source: 'regular',
  }
}
