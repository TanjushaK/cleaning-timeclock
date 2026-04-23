"use client";

import type { ReactNode } from "react";
import AppWorkerShell from "@/app/_components/AppWorkerShell";

export default function LegalShell({ children }: { children: ReactNode }) {
  return (
    <AppWorkerShell>
      <main className="mx-auto max-w-xl w-full flex-1 px-5 py-10">{children}</main>
    </AppWorkerShell>
  );
}
