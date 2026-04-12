import type { Lang } from "@/lib/i18n-config";

/** JSONB maps: locale code -> text */
export type I18nJson = Partial<Record<Lang, string>>;

export function parseI18nJson(v: unknown): I18nJson {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o: I18nJson = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") (o as Record<string, string>)[k] = val;
  }
  return o;
}

/** Prefer current locale, then RU, then other supported locales, then legacy column (typically Russian in DB). */
export function resolveI18nField(i18n: I18nJson, lang: Lang, legacyFallback: string | null | undefined): string {
  const order: Lang[] = [lang, "ru", "en", "uk", "nl"];
  const seen = new Set<string>();
  for (const L of order) {
    if (seen.has(L)) continue;
    seen.add(L);
    const t = String(i18n[L] ?? "").trim();
    if (t) return t;
  }
  return String(legacyFallback ?? "").trim();
}

export function setI18nLocale(i18n: I18nJson, locale: Lang, value: string | null | undefined): I18nJson {
  const next: I18nJson = { ...i18n };
  const v = value == null ? "" : String(value).trim();
  if (!v) {
    delete next[locale];
  } else {
    next[locale] = v;
  }
  return next;
}

/** RU source for DeepL: explicit ru in map, else legacy column. */
export function ruSourceText(i18n: I18nJson, legacy: string | null | undefined): string {
  const fromMap = String(i18n.ru ?? "").trim();
  if (fromMap) return fromMap;
  return String(legacy ?? "").trim();
}
