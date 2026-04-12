import type { Lang } from "@/lib/i18n-config";

/** Per-field translations; RU canonical lives in scalar columns (name, …). */
export type I18nMap = Partial<Record<Exclude<Lang, "ru">, string>> & { ru?: string };

const DERIVED: readonly Exclude<Lang, "ru">[] = ["uk", "en", "nl"];

export function emptyI18nMap(): I18nMap {
  return {};
}

export function parseI18nMap(raw: unknown): I18nMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: I18nMap = {};
  for (const k of Object.keys(raw as Record<string, unknown>)) {
    if (k === "ru" || k === "uk" || k === "en" || k === "nl") {
      const v = (raw as Record<string, unknown>)[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s) (out as Record<string, string>)[k] = s;
    }
  }
  return out;
}

/** Display value: current locale, else RU base string. */
export function resolveLocalizedField(lang: Lang, ruBase: string | null | undefined, map: I18nMap | null | undefined): string {
  const base = String(ruBase ?? "").trim();
  if (lang === "ru") return base;
  const m = map || {};
  const loc = m[lang as keyof I18nMap];
  if (loc != null && String(loc).trim() !== "") return String(loc).trim();
  return base;
}

/** Merge manual / API patch into existing map without dropping unrelated keys. */
export function mergeI18nMap(existing: I18nMap | null | undefined, patch: I18nMap | null | undefined): I18nMap {
  const a = { ...(existing || {}) };
  if (!patch) return a;
  for (const k of Object.keys(patch) as (keyof I18nMap)[]) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v === null || String(v).trim() === "") {
      delete (a as Record<string, string>)[k as string];
    } else {
      (a as Record<string, string>)[k as string] = String(v).trim();
    }
  }
  return a;
}

export function listEmptyDerivedLocales(map: I18nMap | null | undefined, ruSource: string | null | undefined): Exclude<Lang, "ru">[] {
  const src = String(ruSource ?? "").trim();
  if (!src) return [...DERIVED];
  const m = map || {};
  const out: Exclude<Lang, "ru">[] = [];
  for (const l of DERIVED) {
    const v = m[l];
    if (v == null || String(v).trim() === "") out.push(l);
  }
  return out;
}
