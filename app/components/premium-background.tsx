// components/premium-background.tsx
import React from "react";

type PremiumBackgroundProps = {
  /** 0..100 */
  glowOpacityPercent?: number;
};

export default function PremiumBackground({
  glowOpacityPercent = 60,
}: PremiumBackgroundProps) {
  const glowOpacity = Math.max(0, Math.min(100, glowOpacityPercent)) / 100;

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {/* Base dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-black to-zinc-950" />

      {/* Premium gold glow */}
      <div className="absolute inset-0" style={{ opacity: glowOpacity }}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,215,0,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(255,215,0,0.05),transparent_60%)]" />
      </div>

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55))]" />
    </div>
  );
}
