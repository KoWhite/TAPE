export type Market = 'US' | 'HK' | 'CN'

export type SecurityType = 'STOCK' | 'ETF' | 'INDEX' | 'CRYPTO'

export interface TickerSymbol {
  /** Native symbol — e.g. 'AAPL' */
  symbol: string
  /** Futu code — e.g. 'US.AAPL' */
  code: string
  market: Market
  type: SecurityType
  name?: string
  /** Optional user-defined category id (see watchlist store). undefined = uncategorized. */
  categoryId?: string
}

export interface ExtendedSession {
  price: number
  high: number
  low: number
  change: number
  /** Decimal — 0.0123 = +1.23% */
  changePct: number
  volume: number
  turnover: number
}

export type SessionKind = 'preMarket' | 'afterHours' | 'overnight'

export interface Quote {
  code: string
  symbol: string
  name: string
  market: Market
  type: SecurityType
  /** Last traded price */
  last: number
  /** Previous close */
  prevClose: number
  /** Change vs prev close (absolute) */
  change: number
  /** Change vs prev close (decimal, e.g. 0.0123 for +1.23%) */
  changePct: number
  open: number
  high: number
  low: number
  volume: number
  turnover: number
  /** 52-week high — 0 when bridge has no data (e.g. mock provider). */
  high52w?: number
  /** 52-week low — 0 when bridge has no data. */
  low52w?: number
  /** All-time high / low (Futu's highest_history_price / lowest_history_price). */
  allTimeHigh?: number
  allTimeLow?: number
  /** TTM P/E. 0 means missing — common for ETFs and indices. */
  peTtm?: number
  /** Total market cap, native currency. */
  marketCap?: number
  /** ISO timestamp of last update */
  updatedAt: string
  /** Optional intraday tick history for sparkline */
  history?: number[]
  currency?: string
  /** Pre-market / after-hours / overnight prices — populated only for US stocks
   *  during the corresponding session. */
  sessions?: Partial<Record<SessionKind, ExtendedSession>> | null
}

export interface ConnectionStatus {
  connected: boolean
  source: 'mock' | 'bridge'
  latencyMs?: number
  lastError?: string
}

export type SortKey = 'symbol' | 'last' | 'changePct' | 'volume'
export type SortDir = 'asc' | 'desc'
