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
      className={`relative ml-auto flex min-w-0 max-w-full flex-nowrap items-center justify-end gap-1 whitespace-nowrap rounded-full border px-1.5 py-[2px] text-[11px] sm:px-2 sm:text-[12px] ${
        isLight ? "border-amber-500/35 bg-white/85 text-zinc-800" : "border-amber-400/40 bg-black/40 text-zinc-100"
      }`}
    >
      <span className={`pr-1 ${isLight ? "text-zinc-600" : "text-zinc-400"}`}>
        <span className="sm:hidden">Lang</span>
        <span className="hidden sm:inline">{languageLabel}</span>
      </span>

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
