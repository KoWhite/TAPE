<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useWatchlistStore } from '@/stores/watchlist'
import { usePortfolioStore } from '@/stores/portfolio'
import { useEarningsStore } from '@/stores/earnings'
import { useQuotesStore } from '@/stores/quotes'
import EarningsHeader from './components/EarningsHeader.vue'
import EarningsProviderNotice from './components/EarningsProviderNotice.vue'
import EarningsTodaySection from './components/EarningsTodaySection.vue'
import EarningsUpcomingSection from './components/EarningsUpcomingSection.vue'
import EarningsRecentSection from './components/EarningsRecentSection.vue'
import type { EarningsRow, EarningsTodayRow, EarningsWeekGroup } from './types'

const { t, locale } = useI18n()
const watchlist = useWatchlistStore()
const portfolio = usePortfolioStore()
const earnings = useEarningsStore()
const quotesStore = useQuotesStore()
const { quotes } = storeToRefs(quotesStore)
const router = useRouter()

const codes = computed(() => {
  const set = new Set<string>(watchlist.codes)
  for (const p of portfolio.positions) set.add(p.code)
  return [...set]
})

onMounted(() => {
  void earnings.loadMissing(codes.value)
})

const refreshing = ref(false)
async function forceRefresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await earnings.refresh(codes.value)
  } finally {
    refreshing.value = false
  }
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diffDays(iso: string): number {
  const target = new Date(`${iso}T00:00:00`).getTime()
  const today = new Date(`${todayLocal()}T00:00:00`).getTime()
  return Math.round((target - today) / 86_400_000)
}

function symbolFor(code: string): string {
  const t = watchlist.items.find((x) => x.code === code)
  if (t) return t.symbol
  const p = portfolio.find(code)
  if (p) return p.symbol
  return code.split('.').pop() || code
}

const upcoming = computed<EarningsRow[]>(() => {
  const today = todayLocal()
  const rows: EarningsRow[] = []
  for (const code of codes.value) {
    const r = earnings.get(code)
    if (!r?.nextDate) continue
    if (r.nextDate < today) continue
    rows.push({
      code,
      symbol: symbolFor(code),
      date: r.nextDate,
      daysFromToday: diffDays(r.nextDate),
      record: r,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol))
  return rows
})

const today = computed<EarningsTodayRow[]>(() => {
  const dateStr = todayLocal()
  const rows: EarningsTodayRow[] = []
  for (const code of codes.value) {
    const r = earnings.get(code)
    if (!r) continue
    const reportedToday = r.history?.[0]?.date === dateStr
    const upcomingToday = r.nextDate === dateStr
    if (!reportedToday && !upcomingToday) continue
    if (reportedToday) {
      const h = r.history[0]
      rows.push({
        code,
        symbol: symbolFor(code),
        phase: 'post',
        epsEstimate: h.epsEstimate,
        epsActual: h.epsActual,
        epsSurprisePct: h.surprisePct,
        revenueEstimate: h.revenueEstimate ?? null,
        revenueActual: h.revenueActual ?? null,
        revenueSurprisePct: h.revenueSurprisePct ?? null,
      })
    } else {
      rows.push({
        code,
        symbol: symbolFor(code),
        phase: 'pre',
        epsEstimate: r.nextEpsEstimate ?? null,
        epsEstimateRange:
          r.nextEpsLow != null && r.nextEpsHigh != null
            ? { low: r.nextEpsLow, high: r.nextEpsHigh }
            : null,
        epsActual: null,
        epsSurprisePct: null,
        revenueEstimate: r.nextRevenueEstimate ?? null,
        revenueEstimateRange:
          r.nextRevenueLow != null && r.nextRevenueHigh != null
            ? { low: r.nextRevenueLow, high: r.nextRevenueHigh }
            : null,
        revenueActual: null,
        revenueSurprisePct: null,
      })
    }
  }
  rows.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === 'post' ? -1 : 1
    return a.symbol.localeCompare(b.symbol)
  })
  return rows
})

const recent = computed<EarningsRow[]>(() => {
  const today = todayLocal()
  const cutoff = new Date(`${today}T00:00:00`).getTime() - 30 * 86_400_000
  const rows: EarningsRow[] = []
  for (const code of codes.value) {
    const r = earnings.get(code)
    const last = r?.history?.[0]
    if (!last) continue
    const ts = new Date(`${last.date}T00:00:00`).getTime()
    if (ts < cutoff || last.date >= today) continue
    rows.push({
      code,
      symbol: symbolFor(code),
      date: last.date,
      daysFromToday: diffDays(last.date),
      record: r,
    })
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.symbol.localeCompare(b.symbol))
  return rows
})

const upcomingByWeek = computed<EarningsWeekGroup[]>(() => {
  const groups = new Map<string, EarningsWeekGroup>()
  const today = new Date()
  const offsetToMonday = (today.getDay() + 6) % 7
  const thisMonday = new Date(today)
  thisMonday.setHours(0, 0, 0, 0)
  thisMonday.setDate(today.getDate() - offsetToMonday)
  const thisMondayISO = isoDate(thisMonday)
  const nextMondayISO = isoDate(addDays(thisMonday, 7))

  for (const row of upcoming.value) {
    const d = new Date(`${row.date}T00:00:00`)
    const monday = addDays(d, -((d.getDay() + 6) % 7))
    const key = isoDate(monday)
    if (!groups.has(key)) {
      let label: string
      if (key === thisMondayISO) label = t('earnings.upcoming.thisWeek')
      else if (key === nextMondayISO) label = t('earnings.upcoming.nextWeek')
      else label = t('earnings.upcoming.weekOf', { start: monthDay(monday), end: monthDay(addDays(monday, 6)) })
      groups.set(key, { label, startISO: key, rows: [] })
    }
    groups.get(key)!.rows.push(row)
  }
  return [...groups.values()].sort((a, b) => a.startISO.localeCompare(b.startISO))
})

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(d.getDate() + n)
  return x
}

function monthDay(d: Date): string {
  return d.toLocaleDateString(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function openDetail(code: string): void {
  router.push(`/stock/${encodeURIComponent(code)}`)
}
</script>

<template>
  <div class="space-y-6">
    <EarningsHeader
      :codes-count="codes.length"
      :refreshing="refreshing"
      @refresh="forceRefresh"
    />
    <EarningsProviderNotice v-if="!earnings.available" />
    <EarningsTodaySection :rows="today" @open="openDetail" />
    <EarningsUpcomingSection
      :groups="upcomingByWeek"
      :count="upcoming.length"
      :quotes="quotes"
      @open="openDetail"
    />
    <EarningsRecentSection :rows="recent" @open="openDetail" />
  </div>
</template>
