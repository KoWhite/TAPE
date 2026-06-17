<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import IconActivity from '~icons/lucide/activity'
import IconArrowDown from '~icons/lucide/arrow-down'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconArrowUp from '~icons/lucide/arrow-up'
import IconBell from '~icons/lucide/bell'
import IconCalendarClock from '~icons/lucide/calendar-clock'
import IconLineChart from '~icons/lucide/line-chart'
import IconShieldAlert from '~icons/lucide/shield-alert'
import IconWallet from '~icons/lucide/wallet'
import { useQuotes } from '@/composables/useQuotes'
import { useAlertsStore } from '@/stores/alerts'
import { useEarningsStore } from '@/stores/earnings'
import { useFearGreedStore } from '@/stores/fearGreed'
import { usePortfolioStore } from '@/stores/portfolio'
import { useWatchlistStore } from '@/stores/watchlist'
import { formatChange, formatPercent } from '@/utils/format'
import { getQuoteValuation } from '@/utils/quoteValuation'

const { t, locale } = useI18n()
const alerts = useAlertsStore()
const earnings = useEarningsStore()
const fearGreed = useFearGreedStore()
const portfolio = usePortfolioStore()
const watchlist = useWatchlistStore()
const { list, quotes, loading, lastSync } = useQuotes()

const trackedCodes = computed(() => {
  const set = new Set(watchlist.codes)
  for (const p of portfolio.positions) set.add(p.code)
  return [...set]
})

onMounted(() => {
  void fearGreed.load(false)
  void earnings.loadMissing(trackedCodes.value)
})

const portfolioPulse = computed(() => {
  let value = 0
  let day = 0
  let prevValue = 0
  let priced = 0
  for (const p of portfolio.positions) {
    const q = quotes.value.get(p.code)
    const valuation = getQuoteValuation(q)
    if (!valuation) continue
    priced++
    const current = p.shares * valuation.price
    value += current
    day += p.shares * valuation.change
    prevValue += valuation.changePct
      ? current / (1 + valuation.changePct)
      : p.shares * (q?.prevClose ?? 0)
  }
  return {
    value,
    day,
    dayPct: prevValue ? day / prevValue : 0,
    priced,
  }
})

const activeAlerts = computed(() => alerts.rules.filter((r) => r.enabled))
const triggeredAlerts = computed(() => activeAlerts.value.filter((r) => r.triggered))

const upcomingEarnings = computed(() =>
  trackedCodes.value
    .map((code) => ({ code, days: earnings.daysUntil(code) }))
    .filter((x): x is { code: string; days: number } => x.days !== null && x.days <= 7)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3),
)

const topMover = computed(() => {
  const candidates = list.value.filter((q) => Number.isFinite(q.changePct))
  candidates.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
  return candidates[0] ?? null
})

const marketTone = computed(() => {
  const score = fearGreed.data?.score
  const rating = fearGreed.data?.rating
  if (score == null)
    return {
      label: t('overview.focus.moodPending'),
      detail: t('overview.focus.moodPendingDetail'),
    }
  return {
    label: rating || t('overview.focus.moodDefault'),
    detail: t('overview.focus.fearGreedScore', { score: Math.round(score) }),
  }
})

const primaryAction = computed(() => {
  if (triggeredAlerts.value.length) {
    return {
      label: t('overview.focus.alertsTriggered', triggeredAlerts.value.length),
      detail: t('overview.focus.alertsTriggeredDetail'),
      to: '/alerts',
      icon: IconBell,
      tone: 'text-[var(--tape-down)]',
    }
  }
  if (upcomingEarnings.value.length) {
    const next = upcomingEarnings.value[0]
    return {
      label:
        next.days === 0
          ? t('overview.focus.reportsToday', { code: next.code })
          : t('overview.focus.reportsInDays', { code: next.code, days: next.days }),
      detail: t('overview.focus.earningsThisWeek', upcomingEarnings.value.length),
      to: '/earnings',
      icon: IconCalendarClock,
      tone: 'text-[var(--tape-warn)]',
    }
  }
  if (topMover.value) {
    return {
      label: t('overview.focus.isMoving', {
        symbol: topMover.value.symbol,
        pct: formatPercent(topMover.value.changePct),
      }),
      detail: t('overview.focus.isMovingDetail'),
      to: '/movers',
      icon: topMover.value.changePct >= 0 ? IconArrowUp : IconArrowDown,
      tone: topMover.value.changePct >= 0 ? 'text-[var(--tape-up)]' : 'text-[var(--tape-down)]',
    }
  }
  return {
    label: t('overview.focus.buildWatchlist'),
    detail: t('overview.focus.buildWatchlistDetail'),
    to: '/watchlist',
    icon: IconLineChart,
    tone: 'text-[var(--tape-accent)]',
  }
})

const lastSyncLabel = computed(() =>
  lastSync.value
    ? lastSync.value.toLocaleTimeString(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : t('common.notSynced'),
)
</script>

<template>
  <section class="surface overflow-hidden">
    <div class="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
      <div class="p-5 sm:p-6 space-y-5">
        <header class="flex-between gap-3 flex-wrap">
          <div>
            <p class="text-[10px] uppercase tracking-[0.18em] text-soft">
              {{ t('overview.focus.eyebrow') }}
            </p>
            <h3 class="mt-1 text-lg sm:text-xl font-semibold tracking-tight">
              {{ t('overview.focus.title') }}
            </h3>
          </div>
          <div class="pill border border-[var(--tape-border)] text-soft">
            <IconSvgSpinners180RingWithBg v-if="loading" class="size-3" />
            {{ t('overview.focus.updated', { time: lastSyncLabel }) }}
          </div>
        </header>

        <RouterLink
          :to="primaryAction.to"
          class="block rounded-lg border border-[var(--tape-border)] bg-[var(--tape-button-bg)] p-4 hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        >
          <div class="flex items-start gap-3">
            <div class="size-10 rounded-lg flex-center bg-[var(--tape-surface)] border border-[var(--tape-border)] shrink-0">
              <component :is="primaryAction.icon" class="size-5" :class="primaryAction.tone" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold tracking-tight">{{ primaryAction.label }}</div>
              <div class="text-sm text-muted mt-1">{{ primaryAction.detail }}</div>
            </div>
            <IconArrowRight class="size-4 text-soft mt-1 shrink-0" />
          </div>
        </RouterLink>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RouterLink to="/portfolio" class="rounded-lg border border-[var(--tape-border)] p-3 hover:bg-[var(--tape-surface-hover-bg)] transition-colors">
            <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-soft">
              <IconWallet class="size-3.5" />
              {{ t('overview.focus.portfolioToday') }}
            </div>
            <div
              class="text-mono text-lg font-semibold tabular-nums mt-2"
              :class="portfolioPulse.day > 0 ? 'text-[var(--tape-up)]' : portfolioPulse.day < 0 ? 'text-[var(--tape-down)]' : 'text-soft'"
            >
              {{ formatChange(portfolioPulse.day) }}
            </div>
            <div class="text-[11px] text-soft">
              {{ formatPercent(portfolioPulse.dayPct) }} · {{ t('overview.focus.priced', { priced: portfolioPulse.priced, total: portfolio.positions.length }) }}
            </div>
          </RouterLink>

          <RouterLink to="/alerts" class="rounded-lg border border-[var(--tape-border)] p-3 hover:bg-[var(--tape-surface-hover-bg)] transition-colors">
            <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-soft">
              <IconShieldAlert class="size-3.5" />
              {{ t('overview.focus.alertState') }}
            </div>
            <div class="text-mono text-lg font-semibold tabular-nums mt-2">
              {{ triggeredAlerts.length }}/{{ activeAlerts.length }}
            </div>
            <div class="text-[11px] text-soft">{{ t('overview.focus.triggeredActive') }}</div>
          </RouterLink>

          <RouterLink to="/macro" class="rounded-lg border border-[var(--tape-border)] p-3 hover:bg-[var(--tape-surface-hover-bg)] transition-colors">
            <div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-soft">
              <IconActivity class="size-3.5" />
              {{ t('overview.focus.marketMood') }}
            </div>
            <div class="text-sm font-semibold mt-2">{{ marketTone.label }}</div>
            <div class="text-[11px] text-soft">{{ marketTone.detail }}</div>
          </RouterLink>
        </div>
      </div>

      <aside class="border-t lg:border-t-0 lg:border-l border-[var(--tape-border)] p-5 sm:p-6 bg-[var(--tape-bg-elev)]/50 space-y-4">
        <div>
          <p class="text-[10px] uppercase tracking-[0.18em] text-soft">
            {{ t('overview.focus.watchThisWeek') }}
          </p>
          <div class="mt-3 space-y-2">
            <RouterLink
              v-for="item in upcomingEarnings"
              :key="item.code"
              to="/earnings"
              class="flex-between gap-3 rounded-md px-3 py-2 bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
            >
              <span class="text-sm font-medium">{{ item.code }}</span>
              <span class="text-xs text-soft">{{ item.days === 0 ? t('common.today') : `${item.days}d` }}</span>
            </RouterLink>
            <p v-if="!upcomingEarnings.length" class="text-sm text-soft">
              {{ t('overview.focus.noEarnings') }}
            </p>
          </div>
        </div>

        <div class="pt-4 border-t border-[var(--tape-border)]">
          <p class="text-[10px] uppercase tracking-[0.18em] text-soft">
            {{ t('overview.focus.strongestMove') }}
          </p>
          <RouterLink
            v-if="topMover"
            :to="`/stock/${encodeURIComponent(topMover.code)}`"
            class="mt-3 flex-between gap-3 rounded-md px-3 py-2 bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
          >
            <span>
              <span class="block text-sm font-semibold">{{ topMover.symbol }}</span>
              <span class="block text-xs text-soft">{{ topMover.name }}</span>
            </span>
            <span
              class="text-mono text-sm font-semibold"
              :class="topMover.changePct >= 0 ? 'text-[var(--tape-up)]' : 'text-[var(--tape-down)]'"
            >
              {{ formatPercent(topMover.changePct) }}
            </span>
          </RouterLink>
          <p v-else class="mt-3 text-sm text-soft">
            {{ t('overview.focus.noMovers') }}
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>
