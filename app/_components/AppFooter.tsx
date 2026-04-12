"use client";

import { useI18n } from "@/components/I18nProvider";

export default function AppFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="appFooter">
      {t("appFooter.tagline")} <span className="appFooterYear">© {year}</span>
    </footer>
  );
}
