import { defineStore } from 'pinia'
import type { TickerSymbol } from '@/types/stock'

export interface Category {
  id: string
  name: string
  /** CSS color string from CATEGORY_COLORS palette. */
  color: string
  createdAt: string
}

const DEFAULT_WATCHLIST: TickerSymbol[] = [
  { symbol: 'AAPL', code: 'US.AAPL', market: 'US', type: 'STOCK', name: 'Apple Inc.' },
  { symbol: 'NVDA', code: 'US.NVDA', market: 'US', type: 'STOCK', name: 'NVIDIA Corp.' },
  { symbol: 'TSLA', code: 'US.TSLA', market: 'US', type: 'STOCK', name: 'Tesla Inc.' },
  { symbol: 'MSFT', code: 'US.MSFT', market: 'US', type: 'STOCK', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', code: 'US.GOOGL', market: 'US', type: 'STOCK', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', code: 'US.AMZN', market: 'US', type: 'STOCK', name: 'Amazon.com Inc.' },
  { symbol: 'META', code: 'US.META', market: 'US', type: 'STOCK', name: 'Meta Platforms' },
  { symbol: 'AMD', code: 'US.AMD', market: 'US', type: 'STOCK', name: 'Advanced Micro Devices' },
  { symbol: 'SPY', code: 'US.SPY', market: 'US', type: 'ETF', name: 'SPDR S&P 500 ETF' },
  { symbol: 'QQQ', code: 'US.QQQ', market: 'US', type: 'ETF', name: 'Invesco QQQ Trust' },
]

/** Preset palette — chosen to be legible against both light and dark surfaces. */
export const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
] as const

function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase()
}

function inferMarketFromCode(code: string): 'US' | 'HK' | 'CN' {
  if (code.startsWith('HK.')) return 'HK'
  if (code.startsWith('SH.') || code.startsWith('SZ.')) return 'CN'
  return 'US'
}

function symbolFromCode(code: string): string {
  return code.split('.').filter(Boolean).pop() ?? code
}

function toCode(symbol: string, market: 'US' | 'HK' | 'CN' = 'US'): string {
  if (symbol.includes('.')) return symbol
  return `${market}.${symbol}`
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useWatchlistStore = defineStore(
  'watchlist',
  () => {
    const items = ref<TickerSymbol[]>([...DEFAULT_WATCHLIST])
    const categories = ref<Category[]>([])

    const codes = computed(() => items.value.map((t) => t.code))

    function has(symbol: string): boolean {
      const s = normalizeSymbol(symbol)
      return items.value.some((t) => t.symbol === s)
    }

    function add(input: { symbol: string; code?: string; market?: 'US' | 'HK' | 'CN'; name?: string; type?: TickerSymbol['type']; categoryId?: string }): boolean {
      const rawSymbol = normalizeSymbol(input.symbol)
      const rawCode = input.code ? normalizeSymbol(input.code) : (rawSymbol.includes('.') ? rawSymbol : '')
      const symbol = rawCode ? symbolFromCode(rawCode) : rawSymbol
      if (!symbol) return false
      if (has(symbol)) return false
      const market = input.market ?? (rawCode ? inferMarketFromCode(rawCode) : 'US')
      items.value.push({
        symbol,
        code: rawCode || toCode(symbol, market),
        market,
        type: input.type ?? 'STOCK',
        name: input.name,
        categoryId: input.categoryId,
      })
      return true
    }

    function remove(symbol: string): void {
      const s = normalizeSymbol(symbol)
      items.value = items.value.filter((t) => t.symbol !== s)
    }

    function move(from: number, to: number): void {
      if (from === to || from < 0 || to < 0 || from >= items.value.length || to >= items.value.length) return
      const next = [...items.value]
      const [picked] = next.splice(from, 1)
      next.splice(to, 0, picked)
      items.value = next
    }

    function reset(): void {
      items.value = [...DEFAULT_WATCHLIST]
      categories.value = []
    }

    // ───── Categories ──────────────────────────────────────────────
    /** Pick the next color from the palette that's least used so categories
     *  don't all collapse onto the same color when created in sequence. */
    function suggestColor(): string {
      const counts = new Map<string, number>()
      for (const c of categories.value) {
        counts.set(c.color, (counts.get(c.color) ?? 0) + 1)
      }
      let best: string = CATEGORY_COLORS[0]
      let bestN = Infinity
      for (const col of CATEGORY_COLORS) {
        const n = counts.get(col) ?? 0
        if (n < bestN) {
          best = col
          bestN = n
        }
      }
      return best
    }

    function addCategory(name: string, color?: string): Category | null {
      const trimmed = name.trim()
      if (!trimmed) return null
      const cat: Category = {
        id: makeId(),
        name: trimmed,
        color: color ?? suggestColor(),
        createdAt: new Date().toISOString(),
      }
      categories.value = [...categories.value, cat]
      return cat
    }

    function renameCategory(id: string, name: string): void {
      const trimmed = name.trim()
      if (!trimmed) return
      const idx = categories.value.findIndex((c) => c.id === id)
      if (idx < 0) return
      const next = [...categories.value]
      next[idx] = { ...next[idx], name: trimmed }
      categories.value = next
    }

    function setCategoryColor(id: string, color: string): void {
      const idx = categories.value.findIndex((c) => c.id === id)
      if (idx < 0) return
      const next = [...categories.value]
      next[idx] = { ...next[idx], color }
      categories.value = next
    }

    function removeCategory(id: string): void {
      categories.value = categories.value.filter((c) => c.id !== id)
      // Clear categoryId from any ticker that pointed at the deleted category.
      items.value = items.value.map((t) =>
        t.categoryId === id ? { ...t, categoryId: undefined } : t,
      )
    }

    function moveCategory(from: number, to: number): void {
      if (from === to || from < 0 || to < 0 || from >= categories.value.length || to >= categories.value.length) return
      const next = [...categories.value]
      const [picked] = next.splice(from, 1)
      next.splice(to, 0, picked)
      categories.value = next
    }

    function assignCategory(symbol: string, categoryId: string | null): void {
      const s = normalizeSymbol(symbol)
      const idx = items.value.findIndex((t) => t.symbol === s)
      if (idx < 0) return
      const next = [...items.value]
      next[idx] = { ...next[idx], categoryId: categoryId ?? undefined }
      items.value = next
    }

    function categoryOf(symbol: string): Category | null {
      const s = normalizeSymbol(symbol)
      const t = items.value.find((x) => x.symbol === s)
      if (!t?.categoryId) return null
      return categories.value.find((c) => c.id === t.categoryId) ?? null
    }

    /** Map of categoryId → ticker count, plus a synthetic '__none__' entry
     *  for uncategorized items. UI uses this for tab badges. */
    const countsByCategory = computed(() => {
      const map = new Map<string, number>()
      for (const t of items.value) {
        const key = t.categoryId ?? '__none__'
        map.set(key, (map.get(key) ?? 0) + 1)
      }
      return map
    })

    return {
      items,
      categories,
      codes,
      countsByCategory,
      has,
      add,
      remove,
      move,
      reset,
      addCategory,
      renameCategory,
      setCategoryColor,
      removeCategory,
      moveCategory,
      assignCategory,
      categoryOf,
    }
  },
  {
    persist: {
      key: 'tape:watchlist',
      pick: ['items', 'categories'],
    },
  },
)
