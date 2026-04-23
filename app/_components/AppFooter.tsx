"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";

export default function AppFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="appFooter">
      <div className="appFooterRow">
        <span>
          {t("appFooter.tagline")} <span className="appFooterYear">© {year}</span>
        </span>
        <span className="appFooterLinks">
          <Link href="/legal">{t("legalNav.hub")}</Link>
          <span className="appFooterSep">·</span>
          <Link href="/privacy">{t("legalNav.privacy")}</Link>
          <span className="appFooterSep">·</span>
          <Link href="/terms">{t("legalNav.terms")}</Link>
          <span className="appFooterSep">·</span>
          <Link href="/support">{t("legalNav.support")}</Link>
        </span>
      </div>
    </footer>
  );
}
