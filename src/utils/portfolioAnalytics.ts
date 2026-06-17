import type { PortfolioTransaction } from '@/stores/portfolio'

export interface PortfolioAttributionRow {
  code: string
  symbol: string
  buys: number
  sells: number
  buyNotional: number
  sellNotional: number
  realizedTradingPnl: number
  dividends: number
  fees: number
  netRealized: number
  openShares: number
  remainingCost: number
  avgCost: number
  contributionPct: number
}

export interface PortfolioCashflowMonth {
  month: string
  deposits: number
  withdrawals: number
  dividends: number
  interest: number
  fees: number
  tradingCash: number
  netExternal: number
  netInvestmentCash: number
}

export interface PortfolioAnalytics {
  attribution: PortfolioAttributionRow[]
  cashflow: PortfolioCashflowMonth[]
  totals: {
    realizedTradingPnl: number
    dividends: number
    interest: number
    fees: number
    netRealized: number
    deposits: number
    withdrawals: number
    netExternal: number
    netInvestmentCash: number
  }
  warnings: string[]
}

function roundNearZero(value: number): number {
  return Math.abs(value) < 1e-8 ? 0 : value
}

function monthKey(date: string): string {
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : 'Unknown'
}

function signedCash(tx: PortfolioTransaction): number {
  if (tx.type === 'buy') return -(tx.shares * tx.price + tx.fee)
  if (tx.type === 'sell') return tx.shares * tx.price - tx.fee
  if (tx.type === 'dividend' || tx.type === 'interest' || tx.type === 'deposit') return tx.amount ?? 0
  if (tx.type === 'fee' || tx.type === 'withdrawal') return -(tx.amount ?? tx.fee)
  return 0
}

function sorted(transactions: PortfolioTransaction[]): PortfolioTransaction[] {
  return [...transactions].sort((a, b) => {
    const date = a.date.localeCompare(b.date)
    return date || a.createdAt.localeCompare(b.createdAt)
  })
}

export function analyzePortfolio(transactions: PortfolioTransaction[]): PortfolioAnalytics {
  const positions = new Map<string, PortfolioAttributionRow>()
  const months = new Map<string, PortfolioCashflowMonth>()
  const warnings: string[] = []

  const monthFor = (date: string): PortfolioCashflowMonth => {
    const month = monthKey(date)
    let row = months.get(month)
    if (!row) {
      row = {
        month,
        deposits: 0,
        withdrawals: 0,
        dividends: 0,
        interest: 0,
        fees: 0,
        tradingCash: 0,
        netExternal: 0,
        netInvestmentCash: 0,
      }
      months.set(month, row)
    }
    return row
  }

  const rowFor = (tx: PortfolioTransaction): PortfolioAttributionRow => {
    const code = tx.code || 'CASH'
    let row = positions.get(code)
    if (!row) {
      row = {
        code,
        symbol: tx.symbol || code,
        buys: 0,
        sells: 0,
        buyNotional: 0,
        sellNotional: 0,
        realizedTradingPnl: 0,
        dividends: 0,
        fees: 0,
        netRealized: 0,
        openShares: 0,
        remainingCost: 0,
        avgCost: 0,
        contributionPct: 0,
      }
      positions.set(code, row)
    }
    return row
  }

  for (const tx of sorted(transactions)) {
    const month = monthFor(tx.date)
    const cash = signedCash(tx)

    if (tx.type === 'deposit') {
      month.deposits += tx.amount ?? 0
      month.netExternal += tx.amount ?? 0
      month.netInvestmentCash += cash
      continue
    }
    if (tx.type === 'withdrawal') {
      month.withdrawals += tx.amount ?? 0
      month.netExternal -= tx.amount ?? 0
      month.netInvestmentCash += cash
      continue
    }

    month.netInvestmentCash += cash
    if (tx.type === 'buy' || tx.type === 'sell') month.tradingCash += cash
    if (tx.type === 'dividend') month.dividends += tx.amount ?? 0
    if (tx.type === 'interest') month.interest += tx.amount ?? 0
    if (tx.type === 'fee') month.fees += tx.amount ?? tx.fee

    if (!tx.code) continue
    const row = rowFor(tx)
    row.symbol = tx.symbol || row.symbol

    if (tx.type === 'buy') {
      row.buys += tx.shares
      row.buyNotional += tx.shares * tx.price
      row.openShares += tx.shares
      row.remainingCost += tx.shares * tx.price + tx.fee
      row.fees += tx.fee
    } else if (tx.type === 'sell' && row.openShares > 0) {
      const sellShares = Math.min(tx.shares, row.openShares)
      const avgCost = row.remainingCost / row.openShares
      const soldCost = avgCost * sellShares
      row.sells += sellShares
      row.sellNotional += sellShares * tx.price
      row.realizedTradingPnl += sellShares * tx.price - tx.fee - soldCost
      row.openShares = roundNearZero(row.openShares - sellShares)
      row.remainingCost = roundNearZero(row.remainingCost - soldCost)
      row.fees += tx.fee
      if (tx.shares > sellShares) {
        row.sells += tx.shares - sellShares
        row.sellNotional += (tx.shares - sellShares) * tx.price
        warnings.push(`${row.symbol} ${row.code} has ${tx.shares - sellShares} sell shares without matching imported buy history on ${tx.date}.`)
      }
    } else if (tx.type === 'sell') {
      row.sells += tx.shares
      row.sellNotional += tx.shares * tx.price
      row.fees += tx.fee
      row.realizedTradingPnl -= tx.fee
      warnings.push(`${row.symbol} ${row.code} has a sell without matching imported buy history on ${tx.date}. Realized P&L excludes unknown cost basis.`)
    } else if (tx.type === 'dividend') {
      row.dividends += tx.amount ?? 0
    } else if (tx.type === 'fee') {
      const fee = tx.amount ?? tx.fee
      row.fees += fee
      row.realizedTradingPnl -= fee
    }
    row.avgCost = row.openShares ? row.remainingCost / row.openShares : 0
  }

  const attribution = [...positions.values()]
    .map((row) => ({
      ...row,
      netRealized: row.realizedTradingPnl + row.dividends,
    }))
    .filter((row) => row.code !== 'CASH' && (row.buys || row.sells || row.dividends || row.fees || row.openShares))
    .sort((a, b) => Math.abs(b.netRealized) - Math.abs(a.netRealized))

  const cashflow = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  const symbolNetRealized = attribution.reduce((sum, row) => sum + row.netRealized, 0)
  const accountFees = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'fee' && !tx.code ? tx.amount ?? tx.fee : 0),
    0,
  )
  const tradeFees = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'buy' || tx.type === 'sell' ? tx.fee : 0),
    0,
  )
  const interest = cashflow.reduce((sum, row) => sum + row.interest, 0)
  const netRealized = symbolNetRealized + interest - accountFees
  for (const row of attribution) {
    row.contributionPct = symbolNetRealized ? row.netRealized / Math.abs(symbolNetRealized) : 0
  }

  return {
    attribution,
    cashflow,
    totals: {
      realizedTradingPnl: attribution.reduce((sum, row) => sum + row.realizedTradingPnl, 0),
      dividends: attribution.reduce((sum, row) => sum + row.dividends, 0),
      interest,
      fees: tradeFees + cashflow.reduce((sum, row) => sum + row.fees, 0),
      netRealized,
      deposits: cashflow.reduce((sum, row) => sum + row.deposits, 0),
      withdrawals: cashflow.reduce((sum, row) => sum + row.withdrawals, 0),
      netExternal: cashflow.reduce((sum, row) => sum + row.netExternal, 0),
      netInvestmentCash: cashflow.reduce((sum, row) => sum + row.netInvestmentCash, 0),
    },
    warnings,
  }
}
