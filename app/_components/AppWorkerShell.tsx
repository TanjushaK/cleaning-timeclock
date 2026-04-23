"use client";

import type { ReactNode } from "react";
import AppFooter from "@/app/_components/AppFooter";

type Props = {
  children: ReactNode;
  /** Extra classes on the flex-1 content wrapper (after `flex-1 flex flex-col`). */
  mainClassName?: string;
};

export default function AppWorkerShell({ children, mainClassName }: Props) {
  const inner = mainClassName ? `flex-1 flex flex-col ${mainClassName}` : "flex-1 flex flex-col";
  return (
    <div className="appTheme min-h-screen flex flex-col">
      <div className={inner}>{children}</div>
      <AppFooter />
    </div>
  );
}
