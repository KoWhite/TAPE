import {
  fetchAppState,
  saveAppState,
  type AppStatePatch,
  type AppStateResponse,
} from '@/api/appState'
import {
  useAiDailyBriefStore,
  type AiDailyBriefEntry,
} from '@/stores/aiDailyBrief'
import { useAlertsStore, type AlertRule } from '@/stores/alerts'
import {
  useBacktestPresetsStore,
  type BacktestPreset,
} from '@/stores/backtestPresets'
import { useEarningsStore } from '@/stores/earnings'
import { useFearGreedStore } from '@/stores/fearGreed'
import { useMacroStore } from '@/stores/macro'
import { usePolymarketStore } from '@/stores/polymarket'
import {
  usePortfolioHistoryStore,
  type PortfolioSnapshot,
} from '@/stores/portfolioHistory'
import {
  usePortfolioStore,
  type PortfolioExitPlan,
  type PortfolioPosition,
  type PortfolioTransaction,
} from '@/stores/portfolio'
import { useSectorsStore } from '@/stores/sectors'
import {
  useStockAiAnalysisStore,
  type StockAiAnalysisEntry,
} from '@/stores/stockAiAnalysis'
import { useWatchlistStore, type Category } from '@/stores/watchlist'
import type { FearGreed } from '@/types/fearGreed'
import type { MacroSeries } from '@/types/macro'
import type { PolymarketTop } from '@/types/polymarket'
import type { SectorInfo } from '@/types/sector'
import type { TickerSymbol } from '@/types/stock'

interface WatchlistState {
  items: TickerSymbol[]
  categories: Category[]
}

interface PortfolioState {
  positions: PortfolioPosition[]
  transactions?: PortfolioTransaction[]
  exitPlans?: Record<string, PortfolioExitPlan>
  migratedFromPositions?: boolean
}

interface PortfolioHistoryState {
  snapshots: PortfolioSnapshot[]
}

interface AlertsState {
  rules: AlertRule[]
}

interface BacktestPresetsState {
  presets: BacktestPreset[]
}

interface EstimateSnapshot {
  date: string
  epsEstimate: number | null
  revenueEstimate: number | null
  capturedAt: number
}

interface EarningsState {
  snapshots: Record<string, EstimateSnapshot[]>
}

interface MacroCacheEntry {
  data: MacroSeries
  fetchedAt: number
}

interface MacroState {
  cache: Record<string, MacroCacheEntry>
}

interface FearGreedState {
  data: FearGreed | null
  fetchedAt: number | null
}

interface PolymarketState {
  data: PolymarketTop | null
  fetchedAt: number | null
}

interface SectorCacheEntry {
  data: SectorInfo
  fetchedAt: number
}

interface SectorsState {
  cache: Record<string, SectorCacheEntry>
}

interface AiDailyBriefState {
  briefs: Record<string, AiDailyBriefEntry>
}

interface StockAiAnalysisState {
  entries: Record<string, StockAiAnalysisEntry>
}

let started = false
let saveCurrentState: (() => Promise<AppStateResponse>) | null = null

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasRemoteState(state: AppStatePatch): boolean {
  return Object.keys(state).length > 0
}

export function useDatabasePersistence(): void {
  if (started) return
  started = true

  const watchlist = useWatchlistStore()
  const portfolio = usePortfolioStore()
  const portfolioHistory = usePortfolioHistoryStore()
  const alerts = useAlertsStore()
  const backtestPresets = useBacktestPresetsStore()
  const earnings = useEarningsStore()
  const macro = useMacroStore()
  const fearGreed = useFearGreedStore()
  const polymarket = usePolymarketStore()
  const sectors = useSectorsStore()
  const aiDailyBrief = useAiDailyBriefStore()
  const stockAiAnalysis = useStockAiAnalysisStore()

  portfolio.ensureMigrated()

  let hydrated = false
  let applying = false
  let saveTimer: number | undefined

  function snapshot(): AppStatePatch {
    return {
      watchlist: {
        items: clone(watchlist.items),
        categories: clone(watchlist.categories),
      } satisfies WatchlistState,
      portfolio: {
        positions: clone(portfolio.positions),
        transactions: clone(portfolio.transactions),
        exitPlans: clone(portfolio.exitPlans),
        migratedFromPositions: portfolio.migratedFromPositions,
      } satisfies PortfolioState,
      portfolioHistory: {
        snapshots: clone(portfolioHistory.snapshots),
      } satisfies PortfolioHistoryState,
      alerts: {
        rules: clone(alerts.rules),
      } satisfies AlertsState,
      backtestPresets: {
        presets: clone(backtestPresets.presets),
      } satisfies BacktestPresetsState,
      earnings: {
        snapshots: clone(earnings.snapshots),
      } satisfies EarningsState,
      macro: {
        cache: clone(macro.cache),
      } satisfies MacroState,
      fearGreed: {
        data: clone(fearGreed.data),
        fetchedAt: fearGreed.fetchedAt,
      } satisfies FearGreedState,
      polymarket: {
        data: clone(polymarket.data),
        fetchedAt: polymarket.fetchedAt,
      } satisfies PolymarketState,
      sectors: {
        cache: clone(sectors.cache),
      } satisfies SectorsState,
      aiDailyBrief: {
        briefs: clone(aiDailyBrief.briefs),
      } satisfies AiDailyBriefState,
      stockAiAnalysis: {
        entries: clone(stockAiAnalysis.entries),
      } satisfies StockAiAnalysisState,
    }
  }

  function saveNow(): Promise<AppStateResponse> {
    return saveAppState(snapshot())
  }

  saveCurrentState = saveNow

  function applyRemote(state: AppStatePatch): void {
    applying = true
    try {
      if (isRecord(state.watchlist)) {
        const items = state.watchlist.items
        const categories = state.watchlist.categories
        if (Array.isArray(items)) watchlist.items = items as TickerSymbol[]
        if (Array.isArray(categories)) watchlist.categories = categories as Category[]
      }
      if (isRecord(state.portfolio)) {
        const positions = state.portfolio.positions
        const transactions = state.portfolio.transactions
        const exitPlans = state.portfolio.exitPlans
        const migratedFromPositions = state.portfolio.migratedFromPositions
        if (Array.isArray(positions)) portfolio.positions = positions as PortfolioPosition[]
        if (Array.isArray(transactions)) {
          portfolio.transactions = transactions as PortfolioTransaction[]
        }
        if (isRecord(exitPlans)) {
          portfolio.exitPlans = exitPlans as Record<string, PortfolioExitPlan>
        }
        if (typeof migratedFromPositions === 'boolean') {
          portfolio.migratedFromPositions = migratedFromPositions
        }
        portfolio.ensureMigrated()
      }
      if (isRecord(state.portfolioHistory)) {
        const snapshots = state.portfolioHistory.snapshots
        if (Array.isArray(snapshots)) {
          portfolioHistory.snapshots = snapshots as PortfolioSnapshot[]
        }
      }
      if (isRecord(state.alerts)) {
        const rules = state.alerts.rules
        if (Array.isArray(rules)) alerts.rules = rules as AlertRule[]
      }
      if (isRecord(state.backtestPresets)) {
        const presets = state.backtestPresets.presets
        if (Array.isArray(presets)) {
          backtestPresets.presets = presets as BacktestPreset[]
        }
      }
      if (isRecord(state.earnings)) {
        const snapshots = state.earnings.snapshots
        if (isRecord(snapshots)) {
          earnings.snapshots = snapshots as Record<string, EstimateSnapshot[]>
        }
      }
      if (isRecord(state.macro)) {
        const cache = state.macro.cache
        if (isRecord(cache)) macro.cache = cache as Record<string, MacroCacheEntry>
      }
      if (isRecord(state.fearGreed)) {
        if ('data' in state.fearGreed) {
          fearGreed.data = state.fearGreed.data as FearGreed | null
        }
        const fetchedAt = state.fearGreed.fetchedAt
        if (typeof fetchedAt === 'number' || fetchedAt === null) {
          fearGreed.fetchedAt = fetchedAt
        }
      }
      if (isRecord(state.polymarket)) {
        if ('data' in state.polymarket) {
          polymarket.data = state.polymarket.data as PolymarketTop | null
        }
        const fetchedAt = state.polymarket.fetchedAt
        if (typeof fetchedAt === 'number' || fetchedAt === null) {
          polymarket.fetchedAt = fetchedAt
        }
      }
      if (isRecord(state.sectors)) {
        const cache = state.sectors.cache
        if (isRecord(cache)) sectors.cache = cache as Record<string, SectorCacheEntry>
      }
      if (isRecord(state.aiDailyBrief)) {
        const briefs = state.aiDailyBrief.briefs
        if (isRecord(briefs)) {
          aiDailyBrief.briefs = briefs as Record<string, AiDailyBriefEntry>
        }
      }
      if (isRecord(state.stockAiAnalysis)) {
        const entries = state.stockAiAnalysis.entries
        if (isRecord(entries)) {
          stockAiAnalysis.entries = entries as Record<string, StockAiAnalysisEntry>
        }
      }
    } finally {
      applying = false
    }
  }

  function scheduleSave(): void {
    if (!hydrated || applying) return
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      void saveAppState(snapshot()).catch((e) => {
        console.warn('[db] failed to persist app state', e)
      })
    }, 500)
  }

  watch(
    () => [
      watchlist.items,
      watchlist.categories,
      portfolio.positions,
      portfolio.transactions,
      portfolio.exitPlans,
      portfolio.migratedFromPositions,
      portfolioHistory.snapshots,
      alerts.rules,
      backtestPresets.presets,
      earnings.snapshots,
      macro.cache,
      fearGreed.data,
      fearGreed.fetchedAt,
      polymarket.data,
      polymarket.fetchedAt,
      sectors.cache,
      aiDailyBrief.briefs,
      stockAiAnalysis.entries,
    ],
    scheduleSave,
    { deep: true },
  )

  void fetchAppState()
    .then(async (res) => {
      if (hasRemoteState(res.state)) {
        applyRemote(res.state)
      }
      await saveNow()
    })
    .catch((e) => {
      console.warn('[db] app state sync unavailable, using local persistence', e)
    })
    .finally(() => {
      hydrated = true
    })
}

export function persistCurrentAppState(): Promise<AppStateResponse> {
  if (!saveCurrentState) {
    return Promise.reject(new Error('Database persistence has not started yet.'))
  }
  return saveCurrentState()
}
