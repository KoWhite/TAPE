<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import IconRefreshCw from '~icons/lucide/refresh-cw'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import { useMacroStore } from '@/stores/macro'
import type { MacroSeriesConfig } from '@/types/macro'
import MacroAiAnalysisCard from './components/MacroAiAnalysisCard.vue'
import MacroChartHC from './components/MacroChartHC.vue'
import MacroDualChartHC from './components/MacroDualChartHC.vue'
import TacoIndexChart from './components/TacoIndexChart.vue'
import TreasuryRatesChart from './components/TreasuryRatesChart.vue'
import YieldCurveSnapshot from './components/YieldCurveSnapshot.vue'
import YieldCurveSpreadChart from './components/YieldCurveSpreadChart.vue'

/**
 * VIX (CBOE volatility index) is the canonical "fear gauge" -when it
 * spikes, the S&P 500 typically dips. Plotting them on a shared time axis
 * with independent Y axes makes that inverse correlation visually obvious.
 *
 * NB: FRED's SP500 series is licensed and only goes back ~10 years. VIX
 * goes back to 1990 -the chart will simply show VIX-only outside SP500's
 * window if the user picks ALL.
 */
const VIX_CONFIG: MacroSeriesConfig = {
  id: 'VIXCLS',
  label: 'VIX',
  description: 'CBOE volatility index -daily close',
  transform: 'level',
  format: 'number',
  digits: 1,
  start: '2010-01-01',
  positiveIsGood: false,
}

const SP500_CONFIG: MacroSeriesConfig = {
  id: 'SP500',
  label: 'S&P 500',
  description: 'Daily close',
  transform: 'level',
  format: 'number',
  digits: 0,
  // FRED only carries the last ~10 years of SP500 due to licensing.
  start: '2015-01-01',
  positiveIsGood: true,
}

const BUFFETT_SP500_CONFIG: MacroSeriesConfig = {
  ...SP500_CONFIG,
  label: 'S&P 500',
  transform: 'level',
  format: 'number',
  digits: 0,
  start: '2015-01-01',
}

/**
 * Each card is one FRED series with a fixed transform/format. The list is
 * intentionally short; add new entries here as we build out the dashboard.
 *
 * Why these defaults:
 *   PAYEMS  -total nonfarm employment in thousands. The headline NFP
 *             number people quote is the *MoM diff* (e.g. "+200K jobs"),
 *             so we transform with 'mom' and format as 'thousands_signed'.
 *   CPIAUCSL -CPI level. The headline inflation print is the *YoY %*
 *              change, so we transform with 'yoy_pct' and format as percent.
 *   M2SL     -M2 money supply. Rendered as YoY % and paired with S&P 500
 *              so liquidity growth and equity trend can be compared.
 *   SP500    -daily close. We render the underwater (drawdown) view:
 *              `v / running_max - 1`, so the line sits at 0 at every new
 *              all-time high and dips negative during selloffs. FRED only
 *              licenses ~10 years of SP500, so 'ALL' shows ~10y max.
 *   BUFFETT_ADJ_W5000 -improved valuation ratio:
 *              TMC / (GDP + Fed assets). WALCL starts in late 2002; earlier
 *              history falls back to classic TMC/GDP.
 */
const SERIES: MacroSeriesConfig[] = [
  {
    id: 'BUFFETT_ADJ_W5000',
    label: 'Improved Buffett Indicator',
    description: 'TMC / (GDP + Fed assets); QE-adjusted valuation bands',
    transform: 'level',
    format: 'percent',
    digits: 1,
    start: '1970-01-01',
    defaultRange: 'ALL',
    positiveIsGood: false,
    showExtremes: true,
    bands: [
      { from: 0, to: 0.73, label: 'Severely undervalued', tone: 'up' },
      { from: 0.73, to: 0.94, label: 'Undervalued', tone: 'up' },
      { from: 0.94, to: 1.15, label: 'Fair', tone: 'neutral' },
      { from: 1.15, to: 1.36, label: 'Overvalued', tone: 'warn' },
      { from: 1.36, to: 10, label: 'Severely overvalued', tone: 'down' },
    ],
  },
  {
    id: 'PAYEMS',
    label: 'Nonfarm Payrolls',
    description: 'MoM change; thousands of jobs',
    transform: 'mom',
    format: 'thousands_signed',
    digits: 0,
    start: '2010-01-01',
    positiveIsGood: true,
  },
  {
    id: 'UNRATE',
    label: 'Unemployment Rate',
    description: 'Civilian unemployment rate; seasonally adjusted',
    transform: 'level',
    format: 'percent_point',
    digits: 1,
    start: '2000-01-01',
    // A rising unemployment rate is the bad direction.
    positiveIsGood: false,
  },
  {
    id: 'CPIAUCSL',
    label: 'CPI Headline',
    description: 'YoY %; all urban consumers',
    transform: 'yoy_pct',
    format: 'percent_signed',
    digits: 2,
    start: '2008-01-01',
    positiveIsGood: false,
  },
  {
    id: 'M2SL',
    label: 'M2 Money Supply YoY',
    description: 'YoY growth; paired with S&P 500 to compare liquidity and equities',
    transform: 'yoy_pct',
    format: 'percent_signed',
    digits: 2,
    start: '1980-01-01',
    defaultRange: '10Y',
    positiveIsGood: true,
  },
  {
    id: 'SP500',
    label: 'S&P 500 Drawdown',
    description: 'Underwater; % below all-time high',
    transform: 'drawdown',
    format: 'percent_signed',
    digits: 2,
    start: '2015-01-01',
    // For drawdowns, "rising" toward 0 means recovery -that's the good
    // direction even though the absolute number stays -0.
    positiveIsGood: true,
  },
  {
    id: 'SHILLER_CAPE',
    label: 'S&P 500 Shiller PE',
    description: 'CAPE; 10y inflation-adjusted P/E; monthly',
    transform: 'level',
    format: 'number',
    digits: 1,
    // Cheap is good: high CAPE = expensive market.
    positiveIsGood: false,
    // Pin the all-time-high and current value so the position relative to
    // history (e.g. dot-com peak ~44) is the headline takeaway.
    showExtremes: true,
  },
]

const macro = useMacroStore()
const { loading, errors } = storeToRefs(macro)

function loadAll(force = false): void {
  for (const cfg of SERIES) {
    void macro.load(cfg.id, { start: cfg.start, force })
  }
  void macro.load(BUFFETT_SP500_CONFIG.id, { start: BUFFETT_SP500_CONFIG.start, force })
}

function refreshSeries(cfg: MacroSeriesConfig): void {
  void macro.load(cfg.id, { start: cfg.start, force: true })
  if (cfg.id === 'BUFFETT_ADJ_W5000' || cfg.id === 'M2SL') {
    void macro.load(BUFFETT_SP500_CONFIG.id, {
      start: BUFFETT_SP500_CONFIG.start,
      force: true,
    })
  }
}

onMounted(() => loadAll(false))

const anyLoading = computed(() =>
  SERIES.some((s) => loading.value[s.id]),
)

const globalError = computed<string | null>(() => {
  // Show one banner if every series failed for the same reason (typically
  // bridge down / FRED key missing). If only some fail, the per-card error
  // states do the work.
  const messages = SERIES
    .map((s) => errors.value[s.id])
    .filter((e): e is string => Boolean(e))
  if (messages.length !== SERIES.length) return null
  const first = messages[0]
  return messages.every((m) => m === first) ? first : null
})
</script>

<template>
  <div class="space-y-4 sm:space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-xl sm:text-2xl font-semibold tracking-tight">
          Macro
        </h2>
        <p class="text-xs text-muted mt-1">
          US economic indicators; daily refresh from
          <a
            href="https://fred.stlouisfed.org/"
            target="_blank"
            rel="noopener"
            class="hover:text-[var(--tape-text)] underline-offset-2 hover:underline"
          >
            FRED (St. Louis Fed)
          </a>
        </p>
      </div>
      <button
        class="btn-ghost h-9 sm:h-8 px-2.5 sm:px-3 text-xs shrink-0"
        :disabled="anyLoading"
        @click="loadAll(true)"
      >
        <IconRefreshCw class="size-3.5" :class="anyLoading && 'animate-spin'" />
        <span class="hidden xs:inline">Refresh all</span>
      </button>
    </div>

    <!-- AI synthesis card. Reads every chart on this page through the
         macroAiContext registry and writes a fact-grounded summary.
         Placed up top so a returning user gets the takeaway before
         scrolling. Auto-discovers new charts — no wiring needed here. -->
    <MacroAiAnalysisCard />

    <!-- Treasury rates & yield curve section. Anchored at the top because
         macro investors typically scan rates first to set the regime
         backdrop before reading other indicators. -->
    <section class="space-y-4 sm:space-y-5">
      <div>
        <h3 class="text-sm font-semibold tracking-tight flex items-center gap-2">
          <span class="size-2 rounded-full bg-[var(--tape-info)]" />
          Treasury Rates & Yield Curve
        </h3>
        <p class="text-xs text-muted mt-0.5">
          US Treasury yields, the 2s10s / 3M10Y spreads, and the curve's
          current shape vs. one month and one year ago.
        </p>
      </div>

      <TreasuryRatesChart />
      <YieldCurveSpreadChart />
      <YieldCurveSnapshot />
    </section>

    <TacoIndexChart />

    <!-- Global error (e.g. bridge down) -->
    <div
      v-if="globalError"
      class="surface px-4 py-3 flex items-start gap-3 text-sm border-[var(--tape-down-soft)]"
    >
      <IconTriangleAlert class="size-4 mt-0.5 text-[var(--tape-down)] shrink-0" />
      <div class="space-y-1">
        <p class="text-[var(--tape-down)]">{{ globalError }}</p>
        <p class="text-xs text-muted">
          Macro data needs the bridge running with
          <code class="text-mono text-[var(--tape-text)]">FRED_API_KEY</code>
          in its environment. Get a free key at
          <a
            href="https://fred.stlouisfed.org/docs/api/api_key.html"
            target="_blank"
            rel="noopener"
            class="text-[var(--tape-accent)] hover:underline"
          >
            fred.stlouisfed.org
          </a>.
        </p>
      </div>
    </div>

    <div class="grid gap-3 sm:gap-4 lg:gap-5 grid-cols-1">
      <MacroChartHC
        v-for="cfg in SERIES"
        :key="cfg.id"
        :config="cfg"
        :series="macro.get(cfg.id)"
        :comparison-config="cfg.id === 'BUFFETT_ADJ_W5000' || cfg.id === 'M2SL' ? BUFFETT_SP500_CONFIG : null"
        :comparison-series="cfg.id === 'BUFFETT_ADJ_W5000' || cfg.id === 'M2SL' ? macro.get(BUFFETT_SP500_CONFIG.id) : null"
        :loading="loading[cfg.id]"
        :error="errors[cfg.id]"
        :fetched-at="macro.fetchedAt(cfg.id)"
        @refresh="refreshSeries(cfg)"
      />
    </div>

    <!-- Volatility vs Equity -dual-axis comparison. Full-width below the
         single-series grid since the visual story benefits from horizontal
         resolution. -->
    <MacroDualChartHC
      title="Volatility vs S&P 500"
      description="Inverse correlation during stress -VIX spikes mark equity drawdowns"
      :primary="VIX_CONFIG"
      :secondary="SP500_CONFIG"
      primary-style="area"
    />
  </div>
</template>
