import type { Lang } from "@/lib/i18n-config";

function cleanEnv(v: string | undefined | null): string {
  return String(v ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function getDeepLAuthKey(): string | null {
  const v = cleanEnv(process.env.DEEPL_AUTH_KEY);
  return v || null;
}

/** Free keys end with `:fx` → api-free.deepl.com */
export function deeplApiBase(): string | null {
  const key = getDeepLAuthKey();
  if (!key) return null;
  return key.endsWith(":fx") ? "https://api-free.deepl.com/v2" : "https://api.deepl.com/v2";
}

/** DeepL `target_lang` for /translate */
export function langToDeepLTarget(lang: Lang): "UK" | "EN-US" | "NL" | null {
  if (lang === "ru") return null;
  if (lang === "uk") return "UK";
  if (lang === "en") return "EN-US";
  if (lang === "nl") return "NL";
  return null;
}

export type DeepLTranslateResult = { translations: string[] };

/**
 * Batch translate (same order as input). Max 50 texts per call (DeepL limit).
 */
export async function deeplTranslateBatch(
  texts: string[],
  targetLang: "UK" | "EN-US" | "NL",
): Promise<DeepLTranslateResult> {
  const base = deeplApiBase();
  const key = getDeepLAuthKey();
  if (!base || !key) throw new Error("DEEPL_AUTH_KEY is not configured");

  if (texts.length === 0) return { translations: [] };
  if (texts.length > 50) throw new Error("deeplTranslateBatch: max 50 texts per request");

  const body = new URLSearchParams();
  for (const t of texts) body.append("text", t);
  body.set("target_lang", targetLang);
  // source_lang omitted — DeepL auto-detect (mixed RU/UK/dynamic strings)

  const res = await fetch(`${base}/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`DeepL HTTP ${res.status}: ${raw.slice(0, 500)}`);
  }

  let json: { translations?: Array<{ text?: string }> };
  try {
    json = JSON.parse(raw) as { translations?: Array<{ text?: string }> };
  } catch {
    throw new Error("DeepL: invalid JSON");
  }

  const out = (json.translations ?? []).map((x) => String(x.text ?? ""));
  if (out.length !== texts.length) {
    throw new Error("DeepL: translation count mismatch");
  }
  return { translations: out };
}
