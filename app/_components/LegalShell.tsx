"use client";

import type { ReactNode } from "react";
import AppFooter from "@/app/_components/AppFooter";

export default function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="appTheme min-h-screen flex flex-col">
      <main className="mx-auto max-w-xl flex-1 w-full px-5 py-10">{children}</main>
      <AppFooter />
    </div>
  );
}
