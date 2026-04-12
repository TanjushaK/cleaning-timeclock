import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  langFromNavigatorLanguage,
  parseLang,
  type Lang,
} from "@/lib/i18n-config";

function localeFromCookie(cookieHeader: string | null): Lang | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k !== LANG_STORAGE_KEY) continue;
    try {
      return parseLang(decodeURIComponent(v));
    } catch {
      return parseLang(v);
    }
  }
  return null;
}

/** Locale for resolving i18n fields on the server (query ?locale=, cookie ct_lang, Accept-Language). */
export function requestLocale(req: Request): Lang {
  try {
    const url = new URL(req.url);
    const q = parseLang(url.searchParams.get("locale"));
    if (q) return q;
  } catch {
    // ignore
  }

  const fromCookie = localeFromCookie(req.headers.get("cookie"));
  if (fromCookie) return fromCookie;

  const al = req.headers.get("accept-language") || "";
  return langFromNavigatorLanguage(al.split(",")[0] || "");
}

export { DEFAULT_LANG };
