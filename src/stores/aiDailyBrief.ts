import { defineStore } from 'pinia'

export interface AiDailyBriefEntry {
  date: string
  content: string
  generatedAt: string
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const useAiDailyBriefStore = defineStore(
  'aiDailyBrief',
  () => {
    const briefs = ref<Record<string, AiDailyBriefEntry>>({})

    const todayKey = computed(() => todayLocal())
    const todayBrief = computed(() => briefs.value[todayKey.value] ?? null)

    function saveToday(content: string): AiDailyBriefEntry {
      const entry: AiDailyBriefEntry = {
        date: todayKey.value,
        content,
        generatedAt: new Date().toISOString(),
      }
      briefs.value = { ...briefs.value, [entry.date]: entry }
      return entry
    }

    function remove(date: string): void {
      const next = { ...briefs.value }
      delete next[date]
      briefs.value = next
    }

    function prune(keepDays = 30): void {
      const dates = Object.keys(briefs.value).sort().reverse()
      const keep = new Set(dates.slice(0, keepDays))
      briefs.value = Object.fromEntries(
        Object.entries(briefs.value).filter(([date]) => keep.has(date)),
      )
    }

    return { briefs, todayKey, todayBrief, saveToday, remove, prune }
  },
  {
    persist: {
      key: 'tape:ai-daily-brief',
      pick: ['briefs'],
    },
  },
)
