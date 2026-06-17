/**
 * Backtest API contract.
 *
 * Mirrors `server-py/backtests/schemas.py` (result) and
 * `server-py/backtests/registry.py` (catalog).
 *
 * Stage C's LLM path will produce results in this same shape so the
 * frontend renders one result UI for both — adding fields is OK,
 * renaming/removing breaks LLM compatibility.
 */

export type StrategyCategory =
  | 'baseline'
  | 'trend'
  | 'mean_reversion'
  | 'systematic'
  | 'event'
  | 'ai'
export type ParamType = 'int' | 'float'

export interface StrategyParamSpec {
  name: string
  type: ParamType
  default: number
  label: string
  min: number | null
  max: number | null
  step: number | null
}

export interface StrategyMeta {
  id: string
  name: string
  category: StrategyCategory
  description: string
  /** 'single' = strategy runs on one ticker; 'multi' would mean a basket
   *  (Stage B doesn't ship multi yet). */
  universeType: 'single' | 'multi'
  params: StrategyParamSpec[]
}

export interface BacktestCatalogResponse {
  strategies: StrategyMeta[]
}

export interface EquityPoint {
  time: string | number
  value: number
}

export interface NamedSeries {
  name: string
  pane: 'overlay' | 'separate'
  points: EquityPoint[]
}

export interface BacktestTrade {
  entryTime: string | number
  /** null = position still open at backtest end. */
  exitTime: string | number | null
  side: 'long' | 'short'
  symbol: string
  entryPrice: number
  exitPrice: number | null
  size: number
  pnl: number
  /** Decimal: 0.05 = +5% on the trade. */
  pnlPct: number
  reason?: string | null
}

export interface BacktestStats {
  totalReturn: number          // decimal
  annualizedReturn: number
  sharpe: number
  sortino: number
  /** Positive decimal: 0.30 = a 30% peak-to-trough drop. */
  maxDrawdown: number
  winRate: number              // 0..1
  avgWin: number               // per-trade decimal
  avgLoss: number              // per-trade decimal (negative)
  profitFactor: number
  numTrades: number
  benchmarkReturn: number      // decimal
  alpha: number                // decimal: totalReturn - benchmarkReturn
}

export interface BacktestResult {
  strategyId: string
  params: Record<string, number>
  universe: string[]
  startDate: string
  endDate: string
  initialCapital: number
  finalEquity: number
  equityCurve: EquityPoint[]
  benchmarkCurve: EquityPoint[]
  /** Negative decimals (peak = 0). For the area chart underneath. */
  drawdownCurve: EquityPoint[]
  /** Strategy-published auxiliary series — e.g. the MAs / RSI behind
   *  the signals. Stage C will lean on this heavily. */
  extraSeries: NamedSeries[]
  trades: BacktestTrade[]
  stats: BacktestStats | null
  meta: {
    backend?: string
    elapsedMs?: number
    barsAnalyzed?: number
  }
}

/** Bridge accepts numbers for template strategies and a `dsl` object
 *  for the AI Compose path — keep the type wide enough to express both
 *  without forcing every caller to cast. */
export type BacktestParamValue = number | Record<string, unknown> | unknown[]

export interface BacktestRequest {
  strategyId: string
  universe: string[]
  startDate?: string
  endDate?: string
  initialCapital?: number
  params?: Record<string, BacktestParamValue>
}
