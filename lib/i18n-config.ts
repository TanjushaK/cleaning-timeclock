export type Lang = "uk" | "ru" | "en" | "nl";

export const SUPPORTED_LANGS: readonly Lang[] = ["uk", "ru", "en", "nl"] as const;

/** Default for first visit when no cookie/storage (matches prior home default). */
export const DEFAULT_LANG: Lang = "uk";

/** localStorage + cookie (same name for client/SSR alignment) */
export const LANG_STORAGE_KEY = "ct_lang";

/** Legacy key from earlier home-only i18n — read once for migration, then cleared */
export const LEGACY_LOCALE_STORAGE_KEY = "ct_locale";

const LANG_SET = new Set<string>(SUPPORTED_LANGS);

export function isLang(x: string): x is Lang {
  return LANG_SET.has(x);
}

export function parseLang(s: string | undefined | null): Lang | null {
  if (!s) return null;
  const t = String(s).trim();
  return isLang(t) ? t : null;
}

/** Map legacy 3-letter home locales to full Lang */
export function migrateLegacyHomeLocale(v: string | null | undefined): Lang | null {
  if (!v) return null;
  const t = String(v).trim();
  if (t === "ru") return "ru";
  if (t === "uk") return "uk";
  if (t === "en") return "en";
  if (t === "nl") return "nl";
  return null;
}

/** For first visit without saved locale */
export function langFromNavigatorLanguage(nav: string): Lang {
  const n = String(nav || "").toLowerCase();
  if (n.startsWith("ru")) return "ru";
  if (n.startsWith("uk") || n.startsWith("ua")) return "uk";
  if (n.startsWith("nl")) return "nl";
  if (n.startsWith("en")) return "en";
  return DEFAULT_LANG;
}
