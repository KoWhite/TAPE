// vue-i18n setup.
//
// The active locale is owned by the Settings store (persisted under
// `tape:settings`, like `theme`). A `useLanguage` composable keeps the i18n
// instance in sync with the store. Here we only need to pick a sensible
// *initial* locale before Pinia has hydrated, so we peek at the persisted
// blob directly to avoid a flash of English on reload.
import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zh from './locales/zh'

export const SUPPORTED_LOCALES = ['en', 'zh'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'en'

// `en` is the canonical shape; `zh` is type-checked against it in its own file.
export type MessageSchema = typeof en

function isLocale(value: unknown): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale)
}

// Read the persisted Settings locale before Pinia hydrates so first paint is
// already in the right language. Falls back to the browser language, then en.
function resolveInitialLocale(): AppLocale {
  try {
    const raw = localStorage.getItem('tape:settings')
    if (raw) {
      const parsed = JSON.parse(raw) as { language?: unknown }
      if (isLocale(parsed.language)) return parsed.language
    }
  } catch {
    // ignore malformed/inaccessible storage — fall through to detection
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : ''
  if (nav.toLowerCase().startsWith('zh')) return 'zh'
  return DEFAULT_LOCALE
}

export const i18n = createI18n<[MessageSchema], AppLocale>({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, zh },
})

export function setI18nLocale(locale: AppLocale): void {
  // In Composition mode (legacy: false) `global.locale` is a writable ref, but
  // the typed-i18n overload widens it to `string | Ref`; cast to the ref form.
  ;(i18n.global.locale as unknown as { value: AppLocale }).value = locale
  document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en')
}
