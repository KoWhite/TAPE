import { defineStore } from 'pinia'
import type { Quote } from '@/types/stock'
import { getQuoteValuation } from '@/utils/quoteValuation'
import { usePortfolioStore } from './portfolio'

export interface PortfolioSnapshot {
  /** YYYY-MM-DD in local time. */
  date: string
  /** Backward-compatible alias for marketValue. */
  value: number
  /** Backward-compatible alias for costBasis. */
  cost: number
  /** Backward-compatible alias for totalPnl. */
  pnl: number
  marketValue: number
  costBasis: number
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  /** Market value plus realized P&L. Useful when sold gains are no longer open positions. */
  totalEquity: number
  returnPct: number
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const usePortfolioHistoryStore = defineStore(
  'portfolioHistory',
  () => {
    const snapshots = ref<PortfolioSnapshot[]>([])

    function maybeSnapshot(quotes: Map<string, Quote>): void {
      const portfolio = usePortfolioStore()
      portfolio.ensureMigrated()
      const positions = portfolio.positions
      if (positions.length === 0 && portfolio.transactions.length === 0) return

      let marketValue = 0
      let costBasis = 0
      let priced = 0
      for (const p of positions) {
        const valuation = getQuoteValuation(quotes.get(p.code))
        costBasis += p.costBasis
        if (valuation) {
          marketValue += p.shares * valuation.price
          priced++
        }
      }
      if (positions.length > 0 && priced === 0) return

      const realizedPnl =
        positions.reduce((s, p) => s + p.realizedPnl + p.dividends, 0) +
        portfolio.closedPositions.reduce((s, p) => s + p.realizedPnl, 0) +
        portfolio.transactions.reduce((sum, tx) => {
          if (tx.code) return sum
          if (tx.type === 'interest') return sum + (tx.amount ?? 0)
          if (tx.type === 'fee') return sum - (tx.amount ?? tx.fee)
          return sum
        }, 0)
      const unrealizedPnl = marketValue - costBasis
      const totalPnl = realizedPnl + unrealizedPnl
      const totalEquity = marketValue + realizedPnl
      const capitalAtRisk = costBasis + Math.max(0, realizedPnl)
      const returnPct = capitalAtRisk ? totalPnl / capitalAtRisk : 0
      const date = todayLocal()

      const next: PortfolioSnapshot = {
        date,
        value: marketValue,
        cost: costBasis,
        pnl: totalPnl,
        marketValue,
        costBasis,
        realizedPnl,
        unrealizedPnl,
        totalPnl,
        totalEquity,
        returnPct,
      }
      const last = snapshots.value[snapshots.value.length - 1]

      if (last?.date === date) {
        if (
          Math.abs((last.totalEquity ?? last.value) - totalEquity) < 0.005 &&
          Math.abs((last.costBasis ?? last.cost) - costBasis) < 0.005 &&
          Math.abs((last.realizedPnl ?? 0) - realizedPnl) < 0.005
        ) {
          return
        }
        snapshots.value = [...snapshots.value.slice(0, -1), next]
      } else {
        snapshots.value = [...snapshots.value, next]
      }
    }

    function clear(): void {
      snapshots.value = []
    }

    return { snapshots, maybeSnapshot, clear }
  },
  {
    persist: {
      key: 'tape:portfolioHistory',
      pick: ['snapshots'],
    },
  },
)
