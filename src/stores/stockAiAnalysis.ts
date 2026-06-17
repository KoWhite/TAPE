import { defineStore } from 'pinia'

export interface StockAiAnalysisEntry {
  code: string
  date: string
  content: string
  generatedAt: string
  contextVersion: number
}

const AI_CONTEXT_VERSION = 4

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function keyOf(code: string, date = todayLocal()): string {
  return `${code.toUpperCase()}::${date}`
}

export const useStockAiAnalysisStore = defineStore(
  'stockAiAnalysis',
  () => {
    const entries = ref<Record<string, StockAiAnalysisEntry>>({})
    const todayKey = computed(() => todayLocal())

    function getToday(code: string): StockAiAnalysisEntry | null {
      const entry = entries.value[keyOf(code, todayKey.value)] ?? null
      if (!entry || entry.contextVersion !== AI_CONTEXT_VERSION) return null
      return entry
    }

    function saveToday(code: string, content: string): StockAiAnalysisEntry {
      const entry: StockAiAnalysisEntry = {
        code: code.toUpperCase(),
        date: todayKey.value,
        content,
        generatedAt: new Date().toISOString(),
        contextVersion: AI_CONTEXT_VERSION,
      }
      entries.value = { ...entries.value, [keyOf(entry.code, entry.date)]: entry }
      return entry
    }

    function prune(keepDays = 30): void {
      const dates = [...new Set(Object.values(entries.value).map((x) => x.date))]
        .sort()
        .reverse()
      const keep = new Set(dates.slice(0, keepDays))
      entries.value = Object.fromEntries(
        Object.entries(entries.value).filter(([, entry]) => keep.has(entry.date)),
      )
    }

    return { entries, todayKey, getToday, saveToday, prune }
  },
  {
    persist: {
      key: 'tape:stock-ai-analysis',
      pick: ['entries'],
    },
  },
)
