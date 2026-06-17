import { computed, watchEffect } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { setI18nLocale, SUPPORTED_LOCALES, type AppLocale } from '@/i18n'

/**
 * Sync the Pinia `language` setting to the vue-i18n instance (and the
 * <html lang> attribute). Mirrors useTheme: the store is the source of truth,
 * this just propagates changes to i18n. Mount once at the app shell.
 */
export function useLanguage() {
  const settings = useSettingsStore()

  watchEffect(() => {
    setI18nLocale(settings.language)
  })

  const locale = computed<AppLocale>(() => settings.language)

  function set(locale: AppLocale): void {
    settings.language = locale
  }

  /** Cycle to the next supported locale (used by the header toggle). */
  function toggle(): void {
    const idx = SUPPORTED_LOCALES.indexOf(settings.language)
    settings.language =
      SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length]
  }

  return { locale, set, toggle }
}
