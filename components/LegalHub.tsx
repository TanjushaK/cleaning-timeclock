"use client";

import Link from "next/link";
import AppFooter from "@/app/_components/AppFooter";
import { useI18n } from "@/components/I18nProvider";

const LINKS: Array<{ href: string; labelKey: string }> = [
  { href: "/privacy", labelKey: "legalNav.privacy" },
  { href: "/terms", labelKey: "legalNav.terms" },
  { href: "/support", labelKey: "legalNav.support" },
  { href: "/contact", labelKey: "legalNav.contact" },
  { href: "/returns", labelKey: "legalNav.returns" },
  { href: "/shipping", labelKey: "legalNav.shipping" },
];

export default function LegalHub() {
  const { t } = useI18n();

  return (
    <div className="appTheme min-h-screen flex flex-col p-6">
      <div className="mx-auto max-w-lg flex-1 w-full">
        <Link className="text-sm text-amber-300 hover:underline" href="/">
          {t("nav.home")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-amber-100">{t("legalNav.hub")}</h1>
        <p className="mt-2 text-sm text-zinc-300">Van Tanija BV — Cleaning Timeclock</p>
        <ul className="mt-8 space-y-3">
          {LINKS.map((x) => (
            <li key={x.href}>
              <Link
                className="block rounded-2xl border border-amber-500/25 bg-zinc-950/60 px-4 py-3 text-sm font-medium text-amber-100 hover:bg-amber-500/10"
                href={x.href}
              >
                {t(x.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <AppFooter />
    </div>
  );
}
