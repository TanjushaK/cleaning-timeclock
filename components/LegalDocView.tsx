"use client";

import Link from "next/link";
import AppFooter from "@/app/_components/AppFooter";
import { useI18n } from "@/components/I18nProvider";
import type { LegalDocId } from "@/lib/apple-legal-docs";
import { getLegalDocument } from "@/lib/apple-legal-docs";

export default function LegalDocView({ id }: { id: LegalDocId }) {
  const { lang, t } = useI18n();
  const doc = getLegalDocument(id, lang);

  return (
    <div className="appTheme min-h-screen flex flex-col p-6">
      <div className="mx-auto max-w-2xl flex-1 w-full">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
          <Link className="rounded-xl border border-amber-500/30 px-3 py-1.5 hover:bg-amber-500/10" href="/">
            {t("nav.home")}
          </Link>
          <Link className="rounded-xl border border-amber-500/30 px-3 py-1.5 hover:bg-amber-500/10" href="/legal">
            {t("legalNav.hub")}
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-amber-100">{doc.title}</h1>
        {doc.subtitle ? <p className="mt-2 text-sm text-zinc-300">{doc.subtitle}</p> : null}

        <div className="mt-8 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold text-amber-200/95">{s.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200/90 whitespace-pre-wrap">{s.p}</p>
            </section>
          ))}
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
