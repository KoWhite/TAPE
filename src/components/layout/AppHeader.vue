<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSettingsStore } from '@/stores/settings'
import { useTheme } from '@/composables/useTheme'
import { useLanguage } from '@/composables/useLanguage'

const emit = defineEmits<{ toggleMenu: [] }>()

const route = useRoute()
const { t } = useI18n()
const { isDesktop } = useBreakpoint()
const settings = useSettingsStore()
const { toggle: toggleTheme } = useTheme()
const { locale, toggle: toggleLanguage } = useLanguage()

// Route titles are localized via `routes.<name>` keys; fall back to the brand
// name when a route has no name (shouldn't happen for nav routes).
const title = computed(() => {
  const name = route.name as string | undefined
  return name ? t(`routes.${name}`) : t('app.name')
})

// Compact label for the language toggle: shows the language you'd switch TO.
const langToggleLabel = computed(() => (locale.value === 'zh' ? 'EN' : '中'))

const now = ref(new Date())
let timer: number | null = null
onMounted(() => {
  timer = window.setInterval(() => (now.value = new Date()), 1000)
})
onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})

const clock = computed(() =>
  now.value.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/New_York',
  }),
)

const marketSession = computed(() => {
  const ny = new Date(
    now.value.toLocaleString('en-US', { timeZone: 'America/New_York' }),
  )
  const day = ny.getDay()
  const minutes = ny.getHours() * 60 + ny.getMinutes()
  const closed = { label: t('header.session.closed'), tone: 'flat' as const }
  if (day === 0 || day === 6) return closed
  if (minutes >= 570 && minutes < 960)
    return { label: t('header.session.open'), tone: 'up' as const }
  if (minutes >= 240 && minutes < 570)
    return { label: t('header.session.preMarket'), tone: 'flat' as const }
  if (minutes >= 960 && minutes < 1200)
    return { label: t('header.session.afterHours'), tone: 'flat' as const }
  return closed
})

const sourceLabel = computed(() =>
  settings.dataSource === 'bridge'
    ? t('header.sourceBridge')
    : t('header.sourceMock'),
)
</script>

<template>
  <header
    class="sticky top-0 z-40 glass border-b border-[var(--tape-border)] px-3 sm:px-6 lg:px-8 h-13 sm:h-14 flex-between gap-2 sm:gap-3"
  >
    <div class="flex items-center gap-2 sm:gap-3 min-w-0">
      <button
        v-if="!isDesktop"
        class="size-8 rounded-lg flex-center bg-[var(--tape-button-bg)] text-muted hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors shrink-0"
        :aria-label="t('nav.openMenu')"
        @click="emit('toggleMenu')"
      >
        <IconLucideMenu class="size-4" />
      </button>
      <div v-if="!isDesktop" class="flex items-center gap-2 shrink-0">
        <div class="size-8 rounded-lg bg-[var(--tape-accent)] flex-center">
          <IconLucideActivity class="text-black size-4.5" />
        </div>
        <span class="font-semibold text-sm hidden xs:inline">Tape</span>
      </div>
      <h1 class="text-base sm:text-lg font-semibold tracking-tight truncate">
        {{ title }}
      </h1>
    </div>

    <div class="flex items-center gap-2 sm:gap-3">
      <div
        class="hidden sm:flex items-center gap-2 px-3 h-8 rounded-full border border-[var(--tape-border)] text-xs"
      >
        <span
          class="size-1.5 rounded-full"
          :class="{
            'bg-[var(--tape-up)] animate-pulse': marketSession.tone === 'up',
            'bg-[var(--tape-text-soft)]': marketSession.tone === 'flat',
          }"
        />
        <span class="text-soft uppercase tracking-wider text-[10px]">NYSE</span>
        <span class="text-mono font-medium">{{ clock }}</span>
        <span class="text-muted">·</span>
        <span class="text-muted">{{ marketSession.label }}</span>
      </div>

      <button
        class="hidden md:inline-flex pill border border-[var(--tape-border)] bg-[var(--tape-button-bg)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        :title="`${t('header.dataSource')}: ${sourceLabel}`"
      >
        <span
          class="size-1.5 rounded-full"
          :class="{
            'bg-[var(--tape-accent)]': settings.dataSource !== 'mock',
            'bg-[var(--tape-warn)]': settings.dataSource === 'mock',
          }"
        />
        {{ sourceLabel }}
      </button>

      <button
        class="bg-[var(--tape-button-bg)] size-8 rounded-lg flex-center text-xs font-semibold text-muted hover:text-[var(--tape-text)] hover:bg-[var(--tape-button-hover-bg)] transition-colors"
        :title="t('header.switchLanguage')"
        :aria-label="t('header.switchLanguage')"
        @click="toggleLanguage"
      >
        {{ langToggleLabel }}
      </button>

      <button
        class="theme-toggle size-8 rounded-lg flex-center text-muted hover:text-[var(--tape-text)] transition-colors"
        :title="`${t('header.themeLabel')}: ${settings.theme}`"
        :aria-label="t('header.toggleTheme')"
        @click="toggleTheme"
      >
        <IconLucideMoon
          v-if="settings.theme === 'dark'"
          class="size-4"
        />
        <IconLucideSun v-else class="size-4" />
      </button>
    </div>
  </header>
</template>
