import { onScopeDispose, watchEffect } from 'vue'
import { useSettingsStore } from '@/stores/settings'

/**
 * Sync the Pinia theme setting to the <html> class. Listens for OS theme
 * changes when mode is 'system'.
 */
export function useTheme() {
  const settings = useSettingsStore()
  const mql = window.matchMedia('(prefers-color-scheme: dark)')

  function apply(isDark: boolean) {
    document.documentElement.classList.toggle('dark', isDark)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#0b0f17' : '#f7f8fa')
  }

  watchEffect(() => {
    const mode = settings.theme
    if (mode === 'system') {
      apply(mql.matches)
    } else {
      apply(mode === 'dark')
    }
  })

  function onSystemChange(e: MediaQueryListEvent): void {
    if (settings.theme === 'system') apply(e.matches)
  }
  mql.addEventListener('change', onSystemChange)
  onScopeDispose(() => mql.removeEventListener('change', onSystemChange))

  function toggle() {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark'
  }

  return { toggle }
}
