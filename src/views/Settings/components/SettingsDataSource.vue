<script setup lang="ts">
import { computed, ref } from 'vue'
import { getProvider } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import type { ConnectionStatus } from '@/types/stock'

const settings = useSettingsStore()

const connStatus = ref<ConnectionStatus | null>(null)
const checking = ref(false)

const REFRESH_MIN_MS = 1000
const REFRESH_MAX_MS = 60000
const REFRESH_PRESETS = [
  { ms: 3000, label: '3s' },
  { ms: 5000, label: '5s' },
  { ms: 10000, label: '10s' },
  { ms: 30000, label: '30s' },
  { ms: 60000, label: '60s' },
] as const

const refreshSeconds = computed({
  get: () => settings.refreshInterval / 1000,
  set: (v: number) => {
    if (!Number.isFinite(v)) return
    const ms = Math.round(v * 1000)
    settings.refreshInterval = Math.min(
      REFRESH_MAX_MS,
      Math.max(REFRESH_MIN_MS, ms),
    )
  },
})

const dataSourceOptions = computed(() => [
  {
    id: 'mock' as const,
    label: 'Mock data',
    desc: 'Built-in randomized prices - useful for UI work without a live broker.',
    badge: 'No setup',
    badgeTone: 'flat' as const,
  },
  {
    id: 'bridge' as const,
    label: 'Tape bridge',
    desc: 'Talks to server-py/app.py, which wraps local Futu OpenD.',
    badge: 'Live',
    badgeTone: 'up' as const,
  },
])

async function checkConnection(): Promise<void> {
  checking.value = true
  const t0 = performance.now()
  try {
    const status = await getProvider().status()
    connStatus.value = {
      ...status,
      latencyMs: Math.round(performance.now() - t0),
    }
  } catch (e) {
    connStatus.value = {
      connected: false,
      source: settings.dataSource,
      lastError: (e as Error).message,
    }
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <section class="surface p-5 sm:p-6 space-y-5">
    <header>
      <h3 class="font-semibold tracking-tight flex items-center gap-2">
        <IconLucideCable class="size-4 text-[var(--tape-accent)]" />
        Data source
      </h3>
      <p class="text-xs text-muted mt-0.5">
        Choose where market data comes from. Futu live data requires OpenD
        running locally.
      </p>
    </header>

    <div class="grid gap-3 sm:grid-cols-2">
      <label
        v-for="opt in dataSourceOptions"
        :key="opt.id"
        class="surface surface-hover p-4 cursor-pointer relative transition-all"
        :class="{
          '!border-[var(--tape-accent)] ring-1 ring-[var(--tape-accent)]':
            settings.dataSource === opt.id,
        }"
      >
        <input
          v-model="settings.dataSource"
          :value="opt.id"
          type="radio"
          name="data-source"
          class="sr-only"
        />
        <div class="flex-between mb-2">
          <span class="font-medium text-sm">{{ opt.label }}</span>
          <span :class="opt.badgeTone === 'up' ? 'pill-up' : 'pill-flat'">
            {{ opt.badge }}
          </span>
        </div>
        <p class="text-xs text-muted leading-relaxed">{{ opt.desc }}</p>
      </label>
    </div>

    <div
      v-if="settings.dataSource === 'bridge'"
      class="grid gap-4 sm:grid-cols-2 pt-2"
    >
      <label class="block">
        <span class="text-xs text-muted block mb-1.5">
          Bridge URL
          <span class="text-soft">- /api (proxied) or full https URL when deployed</span>
        </span>
        <input
          v-model="settings.bridge.baseUrl"
          class="input-base text-mono"
          placeholder="/api or https://tape.example.com/api"
        />
      </label>

      <div class="block">
        <div class="flex-between mb-1.5 gap-2">
          <span class="text-xs text-muted">
            Refresh interval
            <span class="text-soft">every {{ refreshSeconds }}s</span>
          </span>
        </div>
        <div class="flex gap-2">
          <input
            v-model.number="refreshSeconds"
            type="number"
            :min="REFRESH_MIN_MS / 1000"
            :max="REFRESH_MAX_MS / 1000"
            step="1"
            class="input-base text-mono w-24"
            aria-label="Refresh interval in seconds"
          />
          <div class="flex gap-1 flex-wrap">
            <button
              v-for="p in REFRESH_PRESETS"
              :key="p.ms"
              type="button"
              class="h-9 px-3 rounded-lg text-xs text-mono border border-[var(--tape-border)] transition-colors"
              :class="
                settings.refreshInterval === p.ms
                  ? 'bg-[var(--tape-accent)] text-white border-[var(--tape-accent)]'
                  : 'bg-[var(--tape-button-bg)] text-muted hover:bg-[var(--tape-button-hover-bg)]'
              "
              @click="settings.refreshInterval = p.ms"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <p class="text-[11px] text-soft mt-1.5 leading-relaxed">
          Quotes poll every {{ refreshSeconds }}s. Lower = more responsive but
          more API calls.
        </p>
      </div>

      <p class="sm:col-span-2 text-xs text-muted leading-relaxed">
        The bridge translates Tape's HTTP/JSON contract to Futu OpenD. Run
        <code class="text-mono text-[var(--tape-text)]">python server-py/app.py</code>
        and keep OpenD listening on TCP 11111.
      </p>
    </div>

    <div class="flex-between gap-3 flex-wrap pt-2">
      <div v-if="connStatus" class="flex items-center gap-2 text-sm">
        <span
          class="size-2 rounded-full"
          :class="
            connStatus.connected
              ? 'bg-[var(--tape-up)]'
              : 'bg-[var(--tape-down)]'
          "
        />
        <span class="text-muted">
          {{ connStatus.connected ? 'Connected' : 'Unreachable' }}
        </span>
        <span v-if="connStatus.latencyMs !== undefined" class="text-soft text-xs">
          - {{ connStatus.latencyMs }}ms
        </span>
        <span v-if="connStatus.lastError" class="text-soft text-xs">
          - {{ connStatus.lastError }}
        </span>
      </div>
      <span v-else class="text-xs text-soft">No check run yet.</span>

      <button
        class="btn-outline h-9 text-sm"
        :disabled="checking"
        @click="checkConnection"
      >
        <IconSvgSpinners180RingWithBg v-if="checking" class="size-4" />
        <IconLucideWifi v-else class="size-4" />
        Test connection
      </button>
    </div>
  </section>
</template>
