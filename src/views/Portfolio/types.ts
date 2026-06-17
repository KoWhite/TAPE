import type {
  PortfolioExitReason,
  PortfolioTransactionType,
} from '@/stores/portfolio'

export interface PortfolioRow {
  code: string
  symbol: string
  shares: number
  avgCost: number
  cost: number
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  dividends: number
  last: number
  value: number
  pnl: number
  pnlPct: number
  weight: number
  dayChange: number
  dayChangePct: number
  hasQuote: boolean
  takeProfitPrice?: number
  stopLossPrice?: number
  targetWeight?: number
}

export interface PortfolioSummary {
  cost: number
  value: number
  unrealizedPnl: number
  realizedPnl: number
  totalPnl: number
  totalReturnPct: number
  dayChange: number
  dayChangePct: number
  pricedCount: number
}

export interface PortfolioTradeEditing {
  mode: 'buy' | 'sell' | 'close'
  code: string
  symbol: string
  shares: string
  price: string
  fee: string
  date: string
  reason: PortfolioExitReason
  note: string
}

export interface PortfolioPlanEditing {
  code: string
  symbol: string
  takeProfitPrice: string
  stopLossPrice: string
  targetWeight: string
  enabled: boolean
  note: string
}

export interface PortfolioTransactionRow {
  id: string
  type: PortfolioTransactionType
  code: string
  symbol: string
  shares: number
  price: number
  fee: number
  amount?: number
  date: string
  reason?: PortfolioExitReason
  note?: string
}
