"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";

export default function AppFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="appFooter">
      <nav className="appFooterLegal" aria-label={t("appFooter.legalNavAria")}>
        <Link href="/terms">{t("appFooter.linkTerms")}</Link>
        <span className="appFooterLegalSep" aria-hidden="true">
          ·
        </span>
        <Link href="/privacy">{t("appFooter.linkPrivacy")}</Link>
        <span className="appFooterLegalSep" aria-hidden="true">
          ·
        </span>
        <Link href="/delete-account">{t("appFooter.linkDeleteAccount")}</Link>
        <span className="appFooterLegalSep" aria-hidden="true">
          ·
        </span>
        <Link href="/support">{t("appFooter.linkSupport")}</Link>
      </nav>
      <div className="appFooterTagline">
        {t("appFooter.tagline")} <span className="appFooterYear">© {year}</span>
      </div>
    </footer>
  );
}
