import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  type Lang,
  langFromNavigatorLanguage,
  parseLang,
  SUPPORTED_LANGS,
} from "@/lib/i18n-config";

/** @deprecated use `Lang` from `@/lib/i18n-config` */
export type HomeLocale = Lang;

/** @deprecated use `SUPPORTED_LANGS` */
export const HOME_LOCALES = SUPPORTED_LANGS;

/** @deprecated use `LANG_STORAGE_KEY` (`ct_lang`) */
export const LOCALE_STORAGE_KEY = LANG_STORAGE_KEY;

export function isHomeLocale(v: string | null | undefined): v is HomeLocale {
  return parseLang(v || "") != null;
}

export function readLocaleFromStorage(): HomeLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    return parseLang(v);
  } catch {
    return null;
  }
}

export function detectBrowserLocale(): HomeLocale {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  return langFromNavigatorLanguage(navigator.language || "");
}
