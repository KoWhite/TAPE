import { defineStore } from 'pinia'

export type PortfolioTransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'deposit'
  | 'withdrawal'

export type PortfolioExitReason =
  | 'manual'
  | 'takeProfit'
  | 'stopLoss'
  | 'rebalance'

export interface PortfolioTransaction {
  id: string
  type: PortfolioTransactionType
  /** Futu code, e.g. 'US.AAPL'. Cash-only rows may omit it later. */
  code: string
  symbol: string
  shares: number
  price: number
  /** Positive transaction fee. Included in cost / realized P&L. */
  fee: number
  /** Cash amount for dividend / fee / cash flow rows. */
  amount?: number
  date: string
  reason?: PortfolioExitReason
  note?: string
  createdAt: string
  /** Origin of the row. IBKR-sourced rows are wholesale-replaced on each
   *  snapshot import; manual rows are never touched by the importer. */
  source?: 'manual' | 'ibkr'
}

/** One open-position line from an IBKR Activity Statement snapshot. */
export interface IbkrPositionInput {
  code: string
  symbol: string
  shares: number
  costPrice: number
}

export interface PortfolioExitPlan {
  code: string
  takeProfitPrice?: number
  stopLossPrice?: number
  targetWeight?: number
  enabled: boolean
  note?: string
  updatedAt: string
}

export interface PortfolioPosition {
  code: string
  symbol: string
  shares: number
  avgCost: number
  /** Remaining cost basis for open shares. */
  costBasis: number
  realizedPnl: number
  dividends: number
  fees: number
  note?: string
  addedAt: string
  lastTradeAt: string
}

export interface ClosedPortfolioPosition {
  id: string
  code: string
  symbol: string
  openedAt: string
  closedAt: string
  shares: number
  realizedPnl: number
  dividends: number
  fees: number
  reason?: PortfolioExitReason
}

export interface PortfolioTradeInput {
  code: string
  symbol?: string
  shares: number
  price: number
  fee?: number
  date?: string
  reason?: PortfolioExitReason
  note?: string
}

function makeId(prefix = 'txn'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function symbolFrom(code: string, symbol?: string): string {
  return (symbol || code.split('.').pop() || code).trim().toUpperCase()
}

function roundNearZero(n: number): number {
  return Math.abs(n) < 1e-8 ? 0 : n
}

function txTime(tx: PortfolioTransaction): number {
  return new Date(`${tx.date}T00:00:00`).getTime()
}

export const usePortfolioStore = defineStore(
  'portfolio',
  () => {
    /** Compatibility snapshot. New edits rebuild this from transactions. */
    const positions = ref<PortfolioPosition[]>([])
    const transactions = ref<PortfolioTransaction[]>([])
    const exitPlans = ref<Record<string, PortfolioExitPlan>>({})
    const migratedFromPositions = ref(false)

    const closedPositions = computed<ClosedPortfolioPosition[]>(() => {
      const states = new Map<
        string,
        {
          code: string
          symbol: string
          shares: number
          costBasis: number
          openedAt: string
          boughtShares: number
          realizedPnl: number
          dividends: number
          fees: number
          closedRef?: ClosedPortfolioPosition
        }
      >()
      const closed: ClosedPortfolioPosition[] = []
      for (const tx of sortedTransactions()) {
        if (!tx.code) continue
        const key = tx.code
        let s = states.get(key)
        if (!s) {
          s = {
            code: tx.code,
            symbol: tx.symbol,
            shares: 0,
            costBasis: 0,
            openedAt: tx.date,
            boughtShares: 0,
            realizedPnl: 0,
            dividends: 0,
            fees: 0,
            closedRef: undefined,
          }
          states.set(key, s)
        }
        if (tx.type === 'buy') {
          if (s.shares <= 0) {
            s.openedAt = tx.date
            s.boughtShares = 0
            s.realizedPnl = 0
            s.dividends = 0
            s.fees = 0
            s.closedRef = undefined
          }
          s.symbol = tx.symbol
          s.shares += tx.shares
          s.boughtShares += tx.shares
          s.costBasis += tx.shares * tx.price + tx.fee
          s.fees += tx.fee
        } else if (tx.type === 'sell' && s.shares > 0) {
          const sellShares = Math.min(tx.shares, s.shares)
          const avgCost = s.costBasis / s.shares
          const soldCost = avgCost * sellShares
          s.realizedPnl += sellShares * tx.price - tx.fee - soldCost
          s.fees += tx.fee
          s.shares = roundNearZero(s.shares - sellShares)
          s.costBasis = roundNearZero(s.costBasis - soldCost)
          if (s.shares === 0) {
            const closedRecord: ClosedPortfolioPosition = {
              id: `${s.code}:${s.openedAt}:${tx.date}`,
              code: s.code,
              symbol: s.symbol,
              openedAt: s.openedAt,
              closedAt: tx.date,
              shares: s.boughtShares,
              realizedPnl: s.realizedPnl + s.dividends,
              dividends: s.dividends,
              fees: s.fees,
              reason: tx.reason,
            }
            s.closedRef = closedRecord
            closed.push(closedRecord)
          }
        } else if (tx.type === 'dividend') {
          const amount = tx.amount ?? 0
          if (s.shares > 0 || !s.closedRef) {
            s.dividends += amount
          } else {
            s.closedRef.dividends += amount
            s.closedRef.realizedPnl += amount
          }
        } else if (tx.type === 'fee') {
          const fee = tx.amount ?? tx.fee
          if (s.shares > 0 || !s.closedRef) {
            s.fees += fee
            s.realizedPnl -= fee
          } else {
            s.closedRef.fees += fee
            s.closedRef.realizedPnl -= fee
          }
        }
      }
      return closed.sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    })

    function sortedTransactions(): PortfolioTransaction[] {
      return [...transactions.value].sort((a, b) => {
        const d = txTime(a) - txTime(b)
        return d || a.createdAt.localeCompare(b.createdAt)
      })
    }

    function rebuildPositions(): void {
      const states = new Map<string, PortfolioPosition>()
      for (const tx of sortedTransactions()) {
        if (!tx.code) continue
        const current = states.get(tx.code) ?? {
          code: tx.code,
          symbol: tx.symbol,
          shares: 0,
          avgCost: 0,
          costBasis: 0,
          realizedPnl: 0,
          dividends: 0,
          fees: 0,
          addedAt: tx.date,
          lastTradeAt: tx.date,
          note: undefined,
        }

        if (tx.type === 'buy') {
          current.symbol = tx.symbol
          if (current.shares <= 0) current.addedAt = tx.date
          current.shares += tx.shares
          current.costBasis += tx.shares * tx.price + tx.fee
          current.fees += tx.fee
          current.note = tx.note || current.note
          current.lastTradeAt = tx.date
        } else if (tx.type === 'sell' && current.shares > 0) {
          const sellShares = Math.min(tx.shares, current.shares)
          const avgCost = current.costBasis / current.shares
          const soldCost = avgCost * sellShares
          current.realizedPnl += sellShares * tx.price - tx.fee - soldCost
          current.fees += tx.fee
          current.shares = roundNearZero(current.shares - sellShares)
          current.costBasis = roundNearZero(current.costBasis - soldCost)
          current.lastTradeAt = tx.date
        } else if (tx.type === 'dividend') {
          current.dividends += tx.amount ?? 0
          current.lastTradeAt = tx.date
        } else if (tx.type === 'fee') {
          const fee = tx.amount ?? tx.fee
          current.fees += fee
          current.realizedPnl -= fee
          current.lastTradeAt = tx.date
        }

        current.avgCost = current.shares ? current.costBasis / current.shares : 0
        if (current.shares > 0) states.set(tx.code, current)
        else states.delete(tx.code)
      }
      positions.value = [...states.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
    }

    function ensureMigrated(): void {
      if (transactions.value.length > 0 || migratedFromPositions.value) {
        rebuildPositions()
        return
      }
      const legacy = positions.value.filter((p) => p.shares > 0 && p.avgCost > 0)
      if (!legacy.length) return
      const now = new Date().toISOString()
      transactions.value = legacy.map((p) => ({
        id: makeId('legacy'),
        type: 'buy',
        code: normalizeCode(p.code),
        symbol: symbolFrom(p.code, p.symbol),
        shares: p.shares,
        price: p.avgCost,
        fee: 0,
        date: p.addedAt?.slice(0, 10) || todayLocal(),
        note: p.note,
        createdAt: now,
      }))
      migratedFromPositions.value = true
      rebuildPositions()
    }

    function find(code: string): PortfolioPosition | undefined {
      return positions.value.find((p) => p.code === normalizeCode(code))
    }

    function addTransaction(input: PortfolioTransaction): void {
      transactions.value = [...transactions.value, input]
      rebuildPositions()
    }

    function buy(input: PortfolioTradeInput): PortfolioTransaction {
      const code = normalizeCode(input.code)
      const tx: PortfolioTransaction = {
        id: makeId(),
        type: 'buy',
        code,
        symbol: symbolFrom(code, input.symbol),
        shares: input.shares,
        price: input.price,
        fee: input.fee ?? 0,
        date: input.date || todayLocal(),
        note: input.note,
        createdAt: new Date().toISOString(),
      }
      addTransaction(tx)
      return tx
    }

    function sell(input: PortfolioTradeInput): PortfolioTransaction | null {
      const code = normalizeCode(input.code)
      const position = find(code)
      if (!position || input.shares <= 0 || input.shares > position.shares) return null
      const tx: PortfolioTransaction = {
        id: makeId(),
        type: 'sell',
        code,
        symbol: symbolFrom(code, input.symbol || position.symbol),
        shares: input.shares,
        price: input.price,
        fee: input.fee ?? 0,
        date: input.date || todayLocal(),
        reason: input.reason ?? 'manual',
        note: input.note,
        createdAt: new Date().toISOString(),
      }
      addTransaction(tx)
      return tx
    }

    function closePosition(input: Omit<PortfolioTradeInput, 'shares'>): PortfolioTransaction | null {
      const position = find(input.code)
      if (!position) return null
      return sell({ ...input, shares: position.shares })
    }

    function removeTransaction(id: string): void {
      transactions.value = transactions.value.filter((tx) => tx.id !== id)
      rebuildPositions()
    }

    /**
     * The current IBKR-sourced holdings as a position snapshot — the baseline
     * the next import diffs against. Aggregates `source === 'ibkr'` buy rows
     * by code (normally one row each, but summed defensively).
     */
    function ibkrPositionsSnapshot(): IbkrPositionInput[] {
      const byCode = new Map<string, { symbol: string; shares: number; cost: number }>()
      for (const tx of transactions.value) {
        if (tx.source !== 'ibkr' || tx.type !== 'buy') continue
        const cur = byCode.get(tx.code) ?? { symbol: tx.symbol, shares: 0, cost: 0 }
        cur.shares += tx.shares
        cur.cost += tx.shares * tx.price
        byCode.set(tx.code, cur)
      }
      return [...byCode.entries()].map(([code, v]) => ({
        code,
        symbol: v.symbol,
        shares: v.shares,
        costPrice: v.shares ? v.cost / v.shares : 0,
      }))
    }

    /**
     * Wholesale-replace the IBKR-sourced holdings with a fresh position
     * snapshot. Drops every prior `source === 'ibkr'` row and re-creates one
     * `buy` per open position (price = cost basis per share). Manual rows are
     * left untouched, so a book of "IBKR + a few hand entries" reconciles to
     * the latest statement without clobbering the manual ones.
     */
    function replaceFromIbkr(inputs: IbkrPositionInput[]): { positions: number } {
      const now = new Date().toISOString()
      const manual = transactions.value.filter((tx) => tx.source !== 'ibkr')
      const imported: PortfolioTransaction[] = inputs
        .filter((p) => p.shares > 0 && p.code)
        .map((p) => ({
          id: makeId('ibkr'),
          type: 'buy',
          code: normalizeCode(p.code),
          symbol: symbolFrom(p.code, p.symbol),
          shares: p.shares,
          price: p.costPrice,
          fee: 0,
          date: todayLocal(),
          note: 'IBKR position snapshot',
          createdAt: now,
          source: 'ibkr',
        }))
      transactions.value = [...manual, ...imported]
      rebuildPositions()
      return { positions: imported.length }
    }

    function saveExitPlan(plan: Omit<PortfolioExitPlan, 'updatedAt'>): void {
      const code = normalizeCode(plan.code)
      exitPlans.value = {
        ...exitPlans.value,
        [code]: {
          ...plan,
          code,
          updatedAt: new Date().toISOString(),
        },
      }
    }

    function clearExitPlan(code: string): void {
      const key = normalizeCode(code)
      const next = { ...exitPlans.value }
      delete next[key]
      exitPlans.value = next
    }

    function planFor(code: string): PortfolioExitPlan | null {
      return exitPlans.value[normalizeCode(code)] ?? null
    }

    /** Legacy edit path: replace a code's ledger with a single buy row. */
    function upsert(input: Omit<PortfolioPosition, 'addedAt' | 'costBasis' | 'realizedPnl' | 'dividends' | 'fees' | 'lastTradeAt'> & { addedAt?: string }): void {
      const code = normalizeCode(input.code)
      transactions.value = transactions.value.filter((tx) => tx.code !== code)
      buy({
        code,
        symbol: input.symbol,
        shares: input.shares,
        price: input.avgCost,
        date: input.addedAt?.slice(0, 10) || todayLocal(),
        note: input.note,
      })
    }

    /** Legacy delete path: removes the full ledger for a symbol. */
    function remove(code: string): void {
      const key = normalizeCode(code)
      transactions.value = transactions.value.filter((tx) => tx.code !== key)
      clearExitPlan(key)
      rebuildPositions()
    }

    function clear(): void {
      positions.value = []
      transactions.value = []
      exitPlans.value = {}
      migratedFromPositions.value = false
    }

    watch(transactions, rebuildPositions, { deep: true })

    return {
      positions,
      transactions,
      exitPlans,
      closedPositions,
      migratedFromPositions,
      find,
      ensureMigrated,
      rebuildPositions,
      addTransaction,
      removeTransaction,
      replaceFromIbkr,
      ibkrPositionsSnapshot,
      buy,
      sell,
      closePosition,
      saveExitPlan,
      clearExitPlan,
      planFor,
      upsert,
      remove,
      clear,
    }
  },
  {
    persist: {
      key: 'tape:portfolio',
      pick: ['positions', 'transactions', 'exitPlans', 'migratedFromPositions'],
    },
  },
)
