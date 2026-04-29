"use client";

import type { ReactNode } from "react";
import AppWorkerShell from "@/app/_components/AppWorkerShell";
import LegalBackButton from "@/app/_components/LegalBackButton";

export default function LegalShell({ children }: { children: ReactNode }) {
  return (
    <AppWorkerShell>
      <main className="mx-auto max-w-xl w-full flex-1 px-5 pb-10 pt-6">
        <LegalBackButton />
        {children}
      </main>
    </AppWorkerShell>
  );
}
