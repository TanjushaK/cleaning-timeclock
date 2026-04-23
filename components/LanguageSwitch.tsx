"use client";

import React from "react";
import type { Lang } from "@/lib/i18n-config";
import { useI18n } from "./I18nProvider";
import { useTheme } from "./ThemeProvider";

const ITEMS: Array<{ code: string; value: Lang }> = [
  { code: "UA", value: "uk" },
  { code: "RU", value: "ru" },
  { code: "EN", value: "en" },
  { code: "NL", value: "nl" },
];

export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  const { theme } = useTheme();
  const languageLabel = t("common.language");
  const isLight = theme === "light";

  return (
    <div
      className={`fixed top-[max(0.5rem,calc(env(safe-area-inset-top)-0.5rem))] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex items-center gap-1 rounded-full border px-2 py-[2px] text-[12px] backdrop-blur ${
        isLight ? "border-amber-500/35 bg-white/85 text-zinc-800" : "border-amber-400/40 bg-black/40 text-zinc-100"
      }`}
    >
      <span className={`pr-1 ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>{languageLabel}</span>

      {ITEMS.map((item, idx) => {
        const itemLabel = t(`languages.${item.value}`);
        const active = lang === item.value;

        return (
          <React.Fragment key={item.value}>
            {idx > 0 ? <span className={isLight ? "text-zinc-500" : "text-zinc-500"}>|</span> : null}
            <button
              type="button"
              onClick={() => setLang(item.value)}
              className={
                active
                  ? isLight
                    ? "text-amber-700"
                    : "text-amber-300"
                  : isLight
                    ? "text-zinc-700 hover:text-amber-700"
                    : "text-zinc-300 hover:text-amber-200"
              }
              aria-label={`${languageLabel}: ${itemLabel}`}
              aria-pressed={active}
              title={itemLabel}
            >
              {item.code}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
