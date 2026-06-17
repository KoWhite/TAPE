<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import IconLayoutGrid from '~icons/lucide/layout-grid'
import IconExternalLink from '~icons/lucide/external-link'
import { useSettingsStore } from '@/stores/settings'

/**
 * US-market sector heatmap powered by TradingView's hosted "Stock Heatmap"
 * widget, embedded directly as an iframe.
 *
 * Why iframe instead of TradingView's <script> embed? The script embed
 * relies on injecting a <script> with both `src` and inline JSON text,
 * then having TradingView's loader read its own textContent via
 * `document.currentScript`. In SPA dynamic-mount paths (Vue/React)
 * this often silently fails -the loader fires before its container is
 * laid out, or the inline JSON gets stripped by some bundlers. The
 * iframe URL form takes the same JSON config in the URL fragment and
 * Just Works in any DOM context.
 *
 * Bonus: no third-party JS executes on our origin, the widget is
 * fully sandboxed inside the iframe, and theme/universe switches are a
 * cheap key change instead of a full DOM teardown + script reload.
 */

interface UniverseOpt {
  id: 'sp500' | 'ndx' | 'dj' | 'all'
  /** TradingView `dataSource` value. */
  source: string
}

const UNIVERSES: UniverseOpt[] = [
  { id: 'sp500', source: 'SPX500' },
  { id: 'ndx', source: 'NASDAQ100' },
  { id: 'dj', source: 'DJ' },
  { id: 'all', source: 'AllUSCommonStocks' },
]

const { t } = useI18n()
const settings = useSettingsStore()
const { theme } = storeToRefs(settings)

const universe = ref<UniverseOpt>(UNIVERSES[0])

/** Resolve a concrete TradingView color theme. 'system' follows the OS
 *  preference and reacts to changes via the matchMedia listener below. */
const systemPrefersDark = ref(false)
let mql: MediaQueryList | null = null
function syncSystemPref(): void {
  if (typeof window === 'undefined') return
  systemPrefersDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
}

const resolvedTheme = computed<'light' | 'dark'>(() => {
  if (theme.value === 'dark') return 'dark'
  if (theme.value === 'light') return 'light'
  return systemPrefersDark.value ? 'dark' : 'light'
})

const iframeSrc = computed(() => {
  const config = {
    exchanges: [],
    dataSource: universe.value.source,
    grouping: 'sector',
    blockSize: 'market_cap_basic',
    blockColor: 'change',
    locale: 'en',
    symbolUrl: '',
    colorTheme: resolvedTheme.value,
    hasTopBar: true,
    isDataSetEnabled: true,
    isZoomEnabled: true,
    hasSymbolTooltip: true,
    isMonoSize: false,
    width: '100%',
    height: '560',
  }
  // TradingView's hosted widget reads its config from the URL fragment.
  // The double-encode (JSON -URL-encoded) is what their own embed
  // generates internally -we just construct it directly.
  const encoded = encodeURIComponent(JSON.stringify(config))
  return `https://s.tradingview.com/embed-widget/stock-heatmap/?locale=en#${encoded}`
})

onMounted(() => {
  syncSystemPref()
  if (typeof window !== 'undefined') {
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', syncSystemPref)
  }
})

onBeforeUnmount(() => {
  mql?.removeEventListener('change', syncSystemPref)
  mql = null
})
</script>

<template>
  <article class="surface p-5 sm:p-6 space-y-4">
    <header class="flex-between gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <IconLayoutGrid class="size-4 text-[var(--tape-accent)]" />
        <h3 class="font-semibold tracking-tight">{{ t('overview.marketHeatmap.title') }}</h3>
        <span class="text-[10px] text-soft tracking-[0.18em] uppercase">
          {{ t('overview.marketHeatmap.source') }}
        </span>
      </div>
      <div class="flex items-center gap-1 flex-wrap">
        <button
          v-for="u in UNIVERSES"
          :key="u.id"
          class="px-2.5 h-7 rounded-lg text-[11px] font-medium tracking-wide transition-colors"
          :class="
            universe.id === u.id
              ? 'bg-[var(--tape-button-hover-bg)] text-[var(--tape-text)]'
              : 'bg-[var(--tape-button-bg)] text-soft hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)]'
          "
          @click="universe = u"
        >
          {{ t(`overview.marketHeatmap.universe.${u.id}`) }}
        </button>
      </div>
    </header>

    <!-- Keyed so a theme/universe change forces a fresh iframe load -->
    <iframe
      :key="iframeSrc"
      :src="iframeSrc"
      class="w-full block rounded-xl bg-[var(--tape-surface-hover-bg)]"
      style="height: 560px; border: 0"
      referrerpolicy="origin-when-cross-origin"
      :title="t('overview.marketHeatmap.title')"
      loading="lazy"
    />

    <p class="text-[10px] text-soft tracking-wider uppercase flex items-center gap-1.5">
      <IconExternalLink class="size-3" />
      <a
        href="https://www.tradingview.com/heatmap/stock/"
        target="_blank"
        rel="noopener nofollow"
        class="hover:text-[var(--tape-text)] transition-colors"
      >
        {{ t('overview.marketHeatmap.trackAll') }}
      </a>
    </p>
  </article>
</template>
