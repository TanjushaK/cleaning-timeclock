"use client";

import { SUPPORTED_LANGS, type Lang } from "@/lib/i18n-config";
import { useI18nOptional } from "@/components/I18nProvider";

/** Floating language control — used on all pages inside `I18nProvider`. */
export default function LanguageSwitch() {
  const ctx = useI18nOptional();
  if (!ctx) return null;

  const { lang, setLang, t } = ctx;

  return (
    <div className="fixed right-3 top-3 z-[100] rounded-xl border border-amber-500/25 bg-zinc-950/90 px-2 py-1.5 shadow-lg backdrop-blur">
      <label className="inline-flex items-center gap-2 text-[11px] text-amber-100/85">
        <span className="opacity-80">{t("lang.label")}</span>
        <select
          className="max-w-[9rem] rounded-lg border border-amber-500/30 bg-zinc-900/90 px-2 py-1 text-[11px] text-amber-100 outline-none focus:border-amber-400/50"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          aria-label={t("lang.label")}
        >
          {SUPPORTED_LANGS.map((loc) => (
            <option key={loc} value={loc}>
              {t(`lang.${loc}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
