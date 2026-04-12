"use client";

/**
 * @deprecated Prefer importing from `@/components/I18nProvider`.
 * Thin compatibility layer: `locale` / `setLocale` map to `lang` / `setLang`.
 */
export { default as I18nHomeProvider, useI18n, useI18nOptional } from "@/components/I18nProvider";

import { useI18n, useI18nOptional } from "@/components/I18nProvider";

export function useHomeI18n() {
  const ctx = useI18n();
  return {
    locale: ctx.lang,
    setLocale: ctx.setLang,
    t: ctx.t,
  };
}

export function useHomeI18nOptional() {
  const ctx = useI18nOptional();
  if (!ctx) return null;
  return {
    locale: ctx.lang,
    setLocale: ctx.setLang,
    t: ctx.t,
  };
}
