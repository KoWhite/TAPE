import { defineStore } from 'pinia'
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n'

export type ThemeMode = 'dark' | 'light' | 'system'
export type DataSource = 'mock' | 'bridge'
export type ViewDensity = 'comfortable' | 'compact'

export interface BridgeConfig {
  baseUrl: string
}

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const theme = ref<ThemeMode>('light')
    // Initial value is overwritten by persisted state on hydration; the i18n
    // instance already resolved the same persisted locale at boot.
    const language = ref<AppLocale>(DEFAULT_LOCALE)
    const density = ref<ViewDensity>('comfortable')
    const dataSource = ref<DataSource>('mock')
    const refreshInterval = ref<number>(
      Number(import.meta.env.VITE_POLL_INTERVAL) || 5000,
    )

    const bridge = ref<BridgeConfig>({
      baseUrl: import.meta.env.VITE_API_BASE || '/api',
    })

    const showAfterHours = ref<boolean>(true)
    const flashOnTick = ref<boolean>(true)
    const compactMode = ref<boolean>(false)

    function reset(): void {
      theme.value = 'light'
      language.value = DEFAULT_LOCALE
      density.value = 'comfortable'
      dataSource.value = 'mock'
      refreshInterval.value = 5000
      bridge.value = { baseUrl: '/api' }
      showAfterHours.value = true
      flashOnTick.value = true
      compactMode.value = false
    }

    return {
      theme,
      language,
      density,
      dataSource,
      refreshInterval,
      bridge,
      showAfterHours,
      flashOnTick,
      compactMode,
      reset,
    }
  },
  {
    persist: {
      key: 'tape:settings',
    },
  },
)
