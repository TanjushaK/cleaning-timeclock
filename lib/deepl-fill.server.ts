import type { Lang } from "@/lib/i18n-config";
import type { I18nJson } from "@/lib/localized-records";
import { setI18nLocale } from "@/lib/localized-records";

const DEEPL_BASE_FREE = "https://api-free.deepl.com/v2/translate";
const DEEPL_BASE_PRO = "https://api.deepl.com/v2/translate";

function deeplTarget(lang: Exclude<Lang, "ru">): string {
  if (lang === "en") return "EN";
  if (lang === "uk") return "UK";
  if (lang === "nl") return "NL";
  return "EN";
}

async function translateLine(text: string, target: string, apiKey: string): Promise<string | null> {
  const useFree = !process.env.DEEPL_PRO || process.env.DEEPL_PRO === "0";
  const url = useFree ? DEEPL_BASE_FREE : DEEPL_BASE_PRO;
  const body = new URLSearchParams({
    auth_key: apiKey,
    text,
    source_lang: "RU",
    target_lang: target,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { translations?: { text?: string }[] };
  const out = j?.translations?.[0]?.text;
  return typeof out === "string" ? out : null;
}

/**
 * Fills only empty non-RU locales from Russian source. Does not overwrite existing strings.
 */
export async function fillMissingLocalesFromRu(
  sourceRu: string,
  map: I18nJson,
  targets: readonly Exclude<Lang, "ru">[]
): Promise<I18nJson> {
  const key = process.env.DEEPL_API_KEY?.trim();
  if (!key) {
    throw new Error("DEEPL_NOT_CONFIGURED");
  }

  const src = String(sourceRu ?? "").trim();
  if (!src) return map;

  let next = { ...map };
  for (const lang of targets) {
    const cur = String(next[lang] ?? "").trim();
    if (cur) continue;
    const translated = await translateLine(src, deeplTarget(lang), key);
    if (translated) {
      next = setI18nLocale(next, lang, translated);
    }
  }
  return next;
}
