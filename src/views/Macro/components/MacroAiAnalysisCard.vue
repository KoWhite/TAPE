<script setup lang="ts">
import { computed, ref } from 'vue'
import IconSparkles from '~icons/lucide/sparkles'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconRotateCw from '~icons/lucide/rotate-cw'
import IconShieldAlert from '~icons/lucide/shield-alert'
import {
  aiAnalyzeMacro,
  type MacroAiResponse,
  type MacroAiTone,
} from '@/api/ai'
import { useMacroAiContextStore } from '@/stores/macroAiContext'

/**
 * Synthesizes the Macro page's chart snapshots into a structured AI view.
 * The data flow is:
 *   each chart  → useMacroAiContext({ id, getSnapshot })  → store registry
 *   user clicks → store.collect() → POST /api/ai/macro/analyze → render
 *
 * The card stays passive: it reads what's currently registered. New
 * charts auto-appear in the payload — zero wiring here when one is added.
 */
const store = useMacroAiContextStore()

const result = ref<MacroAiResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const snapshotCount = computed(() => store.registeredIds.length)

const TONE_STYLES: Record<MacroAiTone, { fg: string; bg: string; label: string }> = {
  bullish: { fg: 'var(--tape-up)', bg: 'var(--tape-up-soft)', label: 'Bullish' },
  bearish: { fg: 'var(--tape-down)', bg: 'var(--tape-down-soft)', label: 'Bearish' },
  caution: { fg: 'var(--tape-text)', bg: 'var(--tape-surface-hover-bg)', label: 'Caution' },
  neutral: { fg: 'var(--tape-text-soft)', bg: 'var(--tape-button-bg)', label: 'Neutral' },
}

async function analyze(): Promise<void> {
  if (loading.value) return
  const snapshots = store.collect()
  if (snapshots.length === 0) {
    error.value = 'No chart data ready yet — wait for the charts above to load, then try again.'
    return
  }
  loading.value = true
  error.value = null
  try {
    result.value = await aiAnalyzeMacro({ snapshots })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <article class="surface p-4 sm:p-6 space-y-4">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h3 class="text-base sm:text-lg font-semibold tracking-tight flex items-center gap-2">
            <IconSparkles class="size-4 text-[var(--tape-accent)]" />
            Macro AI Synthesis
          </h3>
          <span class="text-[10px] uppercase tracking-wider text-soft">
            {{ snapshotCount }} chart{{ snapshotCount === 1 ? '' : 's' }} feeding the model
          </span>
        </div>
        <p class="text-xs text-muted mt-1">
          Reads every chart on this page and synthesizes a fact-grounded view.
          Each observation cites the chart it came from — no metric is made up.
        </p>
      </div>
      <button
        class="btn-outline h-8 px-3 text-xs disabled:opacity-50"
        :disabled="loading || snapshotCount === 0"
        @click="analyze"
      >
        <IconRotateCw class="size-3 mr-1" :class="loading && 'animate-spin'" />
        <span v-if="loading">Analyzing…</span>
        <span v-else-if="result">Refresh</span>
        <span v-else>Analyze</span>
      </button>
    </header>

    <div
      v-if="error"
      class="flex items-start gap-2 text-[12px] text-[var(--tape-down)] bg-[var(--tape-down-soft)] px-3 py-2 rounded-md"
    >
      <IconAlertCircle class="size-3.5 mt-0.5 shrink-0" />
      <div class="flex-1">{{ error }}</div>
    </div>

    <div v-if="!result && !loading && !error" class="text-[12px] text-soft py-1">
      Click <span class="text-mono">Analyze</span> to read the page through an
      LLM. Updates only when you ask — AI calls are billable.
    </div>

    <template v-if="result">
      <!-- Regime + headline -->
      <div class="flex items-start gap-3 flex-wrap">
        <span
          class="text-[11px] px-2.5 h-7 inline-flex items-center font-medium uppercase tracking-wider rounded-md"
          :style="{
            color: TONE_STYLES[result.regime.tone].fg,
            backgroundColor: TONE_STYLES[result.regime.tone].bg,
          }"
        >
          {{ result.regime.label }} · {{ TONE_STYLES[result.regime.tone].label }}
        </span>
        <p class="text-[13px] text-[var(--tape-text)] flex-1 min-w-0">
          {{ result.headline }}
        </p>
      </div>

      <!-- Observations -->
      <ul v-if="result.observations.length" class="divide-y divide-[var(--tape-border)]">
        <li v-for="obs in result.observations" :key="obs.id" class="py-3 flex items-start gap-3">
          <span
            class="size-2 mt-2 rounded-full shrink-0"
            :style="{ backgroundColor: TONE_STYLES[obs.tone].fg }"
          />
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
              <h4 class="text-sm font-semibold">{{ obs.title }}</h4>
              <div v-if="obs.cites.length" class="flex items-center gap-1 text-[10px] text-soft flex-wrap">
                <span class="uppercase tracking-wider">cites</span>
                <span
                  v-for="cite in obs.cites"
                  :key="cite"
                  class="text-mono px-1.5 py-0.5 rounded bg-[var(--tape-button-bg)]"
                >
                  {{ cite }}
                </span>
              </div>
            </div>
            <p class="text-[12.5px] leading-relaxed text-muted">{{ obs.body }}</p>
          </div>
        </li>
      </ul>

      <!-- Risks -->
      <div
        v-if="result.risks.length"
        class="rounded-md border border-[var(--tape-border)] bg-[var(--tape-button-bg)] px-3 py-2.5 space-y-1.5"
      >
        <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-soft">
          <IconShieldAlert class="size-3" />
          Risks to the view
        </div>
        <ul class="space-y-1 text-[12px] text-muted leading-relaxed">
          <li v-for="(r, i) in result.risks" :key="i">— {{ r }}</li>
        </ul>
      </div>

      <footer
        v-if="result.asOf || result.model"
        class="flex items-center justify-between gap-3 text-[10px] text-soft pt-1"
      >
        <span v-if="result.asOf">Data as of {{ result.asOf }}</span>
        <span v-if="result.model" class="text-mono">{{ result.model }}</span>
      </footer>
    </template>
  </article>
</template>
