"use client";

export default function PremiumBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      {/* base */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-black to-zinc-950" />

      {/* soft glow */}
      <div className="absolute -top-40 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-yellow-500/10 blur-3xl" />
      <div className="absolute -bottom-48 right-[-140px] h-[520px] w-[520px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute -bottom-64 left-[-160px] h-[560px] w-[560px] rounded-full bg-cyan-500/10 blur-3xl" />

      {/* subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          backgroundPosition: "center",
        }}
      />

      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.0)_0%,rgba(0,0,0,0.35)_55%,rgba(0,0,0,0.72)_100%)]" />
    </div>
  );
}
