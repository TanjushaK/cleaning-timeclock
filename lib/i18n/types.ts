export const HOME_LOCALES = ['ru', 'nl', 'en'] as const
export type HomeLocale = (typeof HOME_LOCALES)[number]

export const LOCALE_STORAGE_KEY = 'ct_locale'

export function isHomeLocale(v: string | null | undefined): v is HomeLocale {
  return v === 'ru' || v === 'nl' || v === 'en'
}

export function readLocaleFromStorage(): HomeLocale | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isHomeLocale(v) ? v : null
  } catch {
    return null
  }
}

export function detectBrowserLocale(): HomeLocale {
  if (typeof navigator === 'undefined') return 'ru'
  const lang = (navigator.language || 'ru').slice(0, 2).toLowerCase()
  if (lang === 'nl') return 'nl'
  if (lang === 'en') return 'en'
  return 'ru'
}
