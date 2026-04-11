export type Lang = "uk" | "ru" | "en" | "nl";

export const SUPPORTED_LANGS: readonly Lang[] = ["uk", "ru", "en", "nl"] as const;

export const DEFAULT_LANG: Lang = "uk";

/** localStorage + cookie (одно имя для согласованности клиента и SSR) */
export const LANG_STORAGE_KEY = "ct_lang";

const LANG_SET = new Set<string>(SUPPORTED_LANGS);

export function isLang(x: string): x is Lang {
  return LANG_SET.has(x);
}

export function parseLang(s: string | undefined | null): Lang | null {
  if (!s) return null;
  const t = String(s).trim();
  return isLang(t) ? t : null;
}

/** Для первого визита без сохранённой локали */
export function langFromNavigatorLanguage(nav: string): Lang {
  const n = String(nav || "").toLowerCase();
  if (n.startsWith("ru")) return "ru";
  if (n.startsWith("uk") || n.startsWith("ua")) return "uk";
  if (n.startsWith("nl")) return "nl";
  if (n.startsWith("en")) return "en";
  return DEFAULT_LANG;
}
