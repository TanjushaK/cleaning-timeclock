import type { Lang } from "@/lib/i18n-config";

const BCP47: Record<Lang, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  en: "en-US",
  nl: "nl-NL",
};

const DASH = "—";

function localeFor(lang: Lang): string {
  return BCP47[lang] ?? BCP47.en;
}

/** Calendar date from YYYY-MM-DD or ISO; empty → em dash. */
export function formatDateShort(lang: Lang, iso?: string | null): string {
  if (!iso) return DASH;
  const s = String(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
}

function hhmmFromRaw(raw?: string | null): string | null {
  if (!raw) return null;
  const x = String(raw);
  return x.length >= 5 ? x.slice(0, 5) : x;
}

/** Wall-clock time (HH:MM) from a time string or ISO. */
export function formatWallTime(lang: Lang, raw?: string | null): string {
  const hhmm = hhmmFromRaw(raw);
  if (!hhmm) return DASH;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return DASH;
  const d = new Date(1970, 0, 1, Number(m[1]), Number(m[2]), 0, 0);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(localeFor(lang), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Date + time from ISO; empty → em dash. */
export function formatDateTimeShort(lang: Lang, iso?: string | null): string {
  if (!iso) return DASH;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
