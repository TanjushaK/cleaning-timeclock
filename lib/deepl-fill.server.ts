/**
 * Server-only: fill empty non-RU locale fields from RU via DeepL.
 * Never overwrites non-empty values (manual edits preserved).
 */
import type { Lang } from "@/lib/i18n-config";
import type { I18nMap } from "@/lib/localized-records";
import { listEmptyDerivedLocales, mergeI18nMap } from "@/lib/localized-records";

const DEEPL_TARGET: Record<Exclude<Lang, "ru">, string> = {
  uk: "UK",
  en: "EN-US",
  nl: "NL",
};

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  const key = process.env.DEEPL_AUTH_KEY || process.env.DEEPL_API_KEY;
  if (!key) throw new Error("Missing DEEPL_AUTH_KEY");

  const apiUrl = (process.env.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate").replace(/\/$/, "");

  const body = new URLSearchParams();
  for (const t of texts) {
    body.append("text", t);
  }
  body.append("target_lang", targetLang);
  body.append("source_lang", "RU");

  const res = await fetch(`${apiUrl}`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepL ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as { translations?: { text: string }[] };
  const out = data.translations?.map((x) => x.text) || [];
  if (out.length !== texts.length) {
    throw new Error("DeepL: translation count mismatch");
  }
  return out;
}

export type FillFieldSpec = {
  ru: string | null | undefined;
  map: I18nMap | null | undefined;
};

async function fillOneField(map: I18nMap, ru: string): Promise<I18nMap> {
  const src = String(ru ?? "").trim();
  if (!src) return { ...map };
  let next = { ...map };
  const empty = listEmptyDerivedLocales(next, src);
  for (const loc of empty) {
    const tl = DEEPL_TARGET[loc];
    const [text] = await translateBatch([src], tl);
    if (text?.trim()) {
      next = mergeI18nMap(next, { [loc]: text.trim() } as I18nMap);
    }
  }
  return next;
}

/**
 * For each field, only fills locales that are empty in `map`; merges into existing map.
 */
export async function fillEmptyFromRuFields(
  fields: { name?: FillFieldSpec; address?: FillFieldSpec; notes?: FillFieldSpec; full_name?: FillFieldSpec },
): Promise<{ name_i18n?: I18nMap; address_i18n?: I18nMap; notes_i18n?: I18nMap; full_name_i18n?: I18nMap }> {
  const result: {
    name_i18n?: I18nMap;
    address_i18n?: I18nMap;
    notes_i18n?: I18nMap;
    full_name_i18n?: I18nMap;
  } = {};

  if (fields.name) {
    result.name_i18n = await fillOneField(fields.name.map || {}, String(fields.name.ru ?? ""));
  }
  if (fields.address) {
    result.address_i18n = await fillOneField(fields.address.map || {}, String(fields.address.ru ?? ""));
  }
  if (fields.notes) {
    result.notes_i18n = await fillOneField(fields.notes.map || {}, String(fields.notes.ru ?? ""));
  }
  if (fields.full_name) {
    result.full_name_i18n = await fillOneField(fields.full_name.map || {}, String(fields.full_name.ru ?? ""));
  }

  return result;
}
