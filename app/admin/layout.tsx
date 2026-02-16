import React from "react";
import PremiumBackground from "./premium-background";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell relative min-h-screen text-zinc-100">
      <PremiumBackground glowOpacityPercent={60} />

      <div className="relative z-10">{children}</div>

      <style>{`
        .admin-shell main {
          background: transparent !important;
          background-image: none !important;
        }
      `}</style>
    </div>
  );
}
