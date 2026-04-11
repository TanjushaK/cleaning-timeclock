'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { formatMsg } from './format'
import { HOME_CATALOG } from './home-catalog'
import { LOCALE_STORAGE_KEY, type HomeLocale, detectBrowserLocale, readLocaleFromStorage } from './types'

type HomeT = (key: string, vars?: Record<string, string | number>) => string

type Ctx = {
  locale: HomeLocale
  setLocale: (l: HomeLocale) => void
  t: HomeT
}

const HomeI18nContext = createContext<Ctx | null>(null)

export function I18nHomeProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<HomeLocale>(() => {
    if (typeof window === 'undefined') return 'ru'
    return readLocaleFromStorage() ?? detectBrowserLocale()
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // private mode / quota
    }
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((l: HomeLocale) => {
    setLocaleState(l)
  }, [])

  const t = useCallback<HomeT>(
    (key, vars) => {
      const pack = HOME_CATALOG[locale] ?? HOME_CATALOG.ru
      const fallback = HOME_CATALOG.ru
      const raw = pack[key] ?? fallback[key] ?? key
      return formatMsg(raw, vars)
    },
    [locale]
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <HomeI18nContext.Provider value={value}>{children}</HomeI18nContext.Provider>
}

export function useHomeI18n(): Ctx {
  const ctx = useContext(HomeI18nContext)
  if (!ctx) throw new Error('useHomeI18n must be used inside I18nHomeProvider')
  return ctx
}

/** Safe for optional use (e.g. future layouts). */
export function useHomeI18nOptional(): Ctx | null {
  return useContext(HomeI18nContext)
}
