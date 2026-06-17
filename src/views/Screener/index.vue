<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import IconSparkles from '~icons/lucide/sparkles'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconPlay from '~icons/lucide/play'
import IconPlus from '~icons/lucide/plus'
import IconCheck from '~icons/lucide/check'
import {
  compileScreen,
  runScreen,
  type ScreenerCompileResponse,
  type ScreenerMatch,
  type ScreenerRunResponse,
} from '@/api/screener'
import { useWatchlistStore } from '@/stores/watchlist'
import { usePortfolioStore } from '@/stores/portfolio'

const { t } = useI18n()
const watchlist = useWatchlistStore()
const portfolio = usePortfolioStore()
const router = useRouter()
const { codes: watchlistCodes } = storeToRefs(watchlist)
const { positions } = storeToRefs(portfolio)

const prompt = ref('')
const compileResult = ref<ScreenerCompileResponse | null>(null)
const runResult = ref<ScreenerRunResponse | null>(null)
const compileError = ref<string | null>(null)
const runError = ref<string | null>(null)
const compiling = ref(false)
const running = ref(false)

const examples = computed(() => [
  t('screener.examples.ex1'),
  t('screener.examples.ex2'),
  t('screener.examples.ex3'),
])

const universeMode = ref<'watchlist' | 'portfolio' | 'combined'>('combined')

const universe = computed<string[]>(() => {
  const set = new Set<string>()
  if (universeMode.value !== 'portfolio') {
    for (const c of watchlistCodes.value) set.add(c)
  }
  if (universeMode.value !== 'watchlist') {
    for (const p of positions.value) set.add(p.code)
  }
  return [...set].sort()
})

async function onCompile(): Promise<void> {
  const text = prompt.value.trim()
  if (!text || compiling.value) return
  compiling.value = true
  compileError.value = null
  runResult.value = null
  try {
    compileResult.value = await compileScreen(text)
  } catch (e) {
    compileError.value = (e as Error).message
    compileResult.value = null
  } finally {
    compiling.value = false
  }
}

async function onRun(): Promise<void> {
  if (!compileResult.value || running.value) return
  if (universe.value.length === 0) {
    runError.value = t('screener.emptyUniverse')
    return
  }
  running.value = true
  runError.value = null
  try {
    runResult.value = await runScreen(compileResult.value.filters, universe.value)
  } catch (e) {
    runError.value = (e as Error).message
    runResult.value = null
  } finally {
    running.value = false
  }
}

function formatMetric(metric: string, value: number): string {
  if (metric.startsWith('change_pct_')) return `${(value * 100).toFixed(2)}%`
  if (metric === 'rsi') return value.toFixed(1)
  if (metric === 'volume_ratio') return `${value.toFixed(2)}×`
  return value.toFixed(2)
}

function addToWatchlist(match: ScreenerMatch): void {
  const sym = match.code.split('.').pop() || match.code
  watchlist.add({ code: match.code, symbol: sym })
}

function isOnWatchlist(code: string): boolean {
  return watchlistCodes.value.includes(code)
}

function openDetail(code: string): void {
  router.push(`/stock/${encodeURIComponent(code)}`)
}

function fillExample(text: string): void {
  prompt.value = text
}
</script>

<template>
  <div class="space-y-5">
    <header>
      <h2 class="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
        <IconSparkles class="size-5 text-[var(--tape-accent)]" />
        {{ t('screener.title') }}
      </h2>
      <p class="text-xs text-muted mt-1">
        {{ t('screener.subtitle') }}
      </p>
    </header>

    <section class="surface p-4 space-y-3">
      <label class="block">
        <span class="text-[11px] uppercase tracking-wider text-soft">{{ t('screener.prompt') }}</span>
        <textarea
          v-model="prompt"
          rows="3"
          class="mt-1 w-full text-mono text-[13px] bg-[var(--tape-bg)] border border-[var(--tape-border)] rounded-md px-3 py-2 resize-y focus:outline-none focus:border-[var(--tape-border-hover)]"
          :placeholder="t('screener.promptPlaceholder')"
        />
      </label>

      <div class="flex flex-wrap gap-1.5 text-[11px]">
        <span class="text-soft mr-1">{{ t('screener.try') }}</span>
        <button
          v-for="ex in examples"
          :key="ex"
          class="px-2 py-0.5 rounded bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)] text-soft hover:text-[var(--tape-text)] transition-colors"
          @click="fillExample(ex)"
        >
          {{ ex }}
        </button>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <label class="text-[11px] text-soft flex items-center gap-2">
          {{ t('screener.universe') }}
          <select
            v-model="universeMode"
            class="bg-[var(--tape-bg)] border border-[var(--tape-border)] rounded-md px-2 h-7 text-[12px]"
          >
            <option value="combined">{{ t('screener.universeCombined', { count: universe.length }) }}</option>
            <option value="watchlist">{{ t('screener.universeWatchlist', { count: watchlistCodes.length }) }}</option>
            <option value="portfolio">{{ t('screener.universePortfolio', { count: positions.length }) }}</option>
          </select>
        </label>

        <button
          class="ml-auto btn-outline h-8 px-3 text-xs disabled:opacity-50"
          :disabled="!prompt.trim() || compiling"
          @click="onCompile"
        >
          <IconSparkles class="size-3 mr-1" />
          {{ compiling ? t('screener.compiling') : t('screener.compile') }}
        </button>
      </div>

      <div
        v-if="compileError"
        class="flex items-start gap-2 text-[12px] text-[var(--tape-down)] bg-[var(--tape-down-soft)] px-3 py-2 rounded-md"
      >
        <IconAlertCircle class="size-3.5 mt-0.5 shrink-0" />
        <div class="flex-1">{{ compileError }}</div>
      </div>
    </section>

    <section v-if="compileResult" class="surface p-4 space-y-3">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-sm font-semibold">{{ compileResult.name }}</div>
          <p v-if="compileResult.rationale" class="text-[12px] text-muted mt-0.5">
            {{ compileResult.rationale }}
          </p>
        </div>
        <button
          class="btn-outline h-8 px-3 text-xs disabled:opacity-50"
          :disabled="running || universe.length === 0"
          @click="onRun"
        >
          <IconPlay class="size-3 mr-1" />
          {{ running ? t('screener.scanning', { count: universe.length }) : t('screener.runOn', { count: universe.length }) }}
        </button>
      </div>

      <ul class="divide-y divide-[var(--tape-border)] text-[12px]">
        <li
          v-for="(f, i) in compileResult.filters"
          :key="i"
          class="py-1.5 flex items-center gap-2 text-mono"
        >
          <span class="text-soft text-[10px] uppercase tracking-wider">{{ i + 1 }}</span>
          <span class="text-[var(--tape-accent)]">{{ f.metric }}</span>
          <span
            v-for="(v, k) in f.params"
            :key="String(k)"
            class="text-soft"
          >({{ k }}={{ v }})</span>
          <span class="font-medium">{{ f.op }}</span>
          <span>{{ f.value }}</span>
        </li>
      </ul>

      <div
        v-if="runError"
        class="flex items-start gap-2 text-[12px] text-[var(--tape-down)] bg-[var(--tape-down-soft)] px-3 py-2 rounded-md"
      >
        <IconAlertCircle class="size-3.5 mt-0.5 shrink-0" />
        <div class="flex-1">{{ runError }}</div>
      </div>
    </section>

    <section v-if="runResult" class="surface overflow-hidden">
      <header class="px-4 py-3 border-b border-[var(--tape-border)] flex items-center justify-between gap-2 flex-wrap">
        <div class="text-sm font-semibold">
          {{ t('screener.matches', runResult.matches.length) }}
          <span class="text-soft text-[12px] font-normal">
            {{ t('screener.scanned', runResult.scanned) }}
          </span>
        </div>
        <div v-if="runResult.skipped.length" class="text-[11px] text-soft">
          {{ t('screener.skipped', { count: runResult.skipped.length }) }}
        </div>
      </header>

      <div v-if="!runResult.matches.length" class="px-4 py-8 text-center text-sm text-soft">
        {{ t('screener.noMatches') }}
      </div>
      <table v-else class="w-full text-[13px]">
        <thead>
          <tr class="text-[10px] uppercase tracking-wider text-soft">
            <th class="text-left px-4 py-2 font-medium">{{ t('screener.colSymbol') }}</th>
            <th class="text-right px-4 py-2 font-medium">{{ t('screener.colLast') }}</th>
            <th
              v-for="f in runResult.filters"
              :key="f.metric"
              class="text-right px-4 py-2 font-medium text-mono"
            >
              {{ f.metric }}
            </th>
            <th class="w-10" />
          </tr>
        </thead>
        <tbody class="divide-y divide-[var(--tape-border)]">
          <tr
            v-for="m in runResult.matches"
            :key="m.code"
            class="hover:bg-[var(--tape-button-bg)] cursor-pointer"
            @click="openDetail(m.code)"
          >
            <td class="px-4 py-2 font-medium">{{ m.code.split('.').pop() }}</td>
            <td class="px-4 py-2 text-right text-mono">{{ m.last.toFixed(2) }}</td>
            <td
              v-for="f in runResult.filters"
              :key="f.metric"
              class="px-4 py-2 text-right text-mono"
            >
              {{ m.metrics[f.metric] !== undefined ? formatMetric(f.metric, m.metrics[f.metric]) : '--' }}
            </td>
            <td class="px-2 py-2 text-right">
              <button
                v-if="!isOnWatchlist(m.code)"
                class="size-7 rounded-md bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)] inline-flex items-center justify-center text-soft hover:text-[var(--tape-text)]"
                :title="t('screener.addToWatchlist')"
                @click.stop="addToWatchlist(m)"
              >
                <IconPlus class="size-3.5" />
              </button>
              <span
                v-else
                class="size-7 inline-flex items-center justify-center text-soft"
                :title="t('screener.onWatchlist')"
              >
                <IconCheck class="size-3.5" />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
