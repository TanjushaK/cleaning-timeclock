"use client";

import React from "react";

type OSMMiniMapProps = {
  lat: number | string | null | undefined;
  lng: number | string | null | undefined;
  zoom?: number; // 1..19
  heightPx?: number;
  className?: string;
};

function toFiniteNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bboxFromLatLng(lat: number, lng: number, zoom: number): string {
  // Простая, стабильная рамка (bbox) под embed OSM.
  // Чем больше zoom — тем меньше окно.
  const z = clamp(zoom, 1, 19);

  // Эмпирические дельты: на 15-м зуме окно ~2-3 км по ширине.
  const base = 0.02;
  const factor = Math.pow(2, 15 - z);
  const dLat = base * factor;
  const dLng = base * factor;

  const minLat = clamp(lat - dLat, -90, 90);
  const maxLat = clamp(lat + dLat, -90, 90);
  const minLng = clamp(lng - dLng, -180, 180);
  const maxLng = clamp(lng + dLng, -180, 180);

  // OSM bbox порядок: left,bottom,right,top = minLng,minLat,maxLng,maxLat
  return `${minLng},${minLat},${maxLng},${maxLat}`;
}

export default function OSMMiniMap({
  lat,
  lng,
  zoom = 15,
  heightPx = 220,
  className = "",
}: OSMMiniMapProps) {
  const la = toFiniteNumber(lat);
  const ln = toFiniteNumber(lng);

  if (la === null || ln === null) {
    return (
      <div
        className={[
          "rounded-2xl border border-yellow-400/15 bg-zinc-950/60 p-4 text-sm text-zinc-300",
          className,
        ].join(" ")}
      >
        Нет координат (Lat/Lng)
      </div>
    );
  }

  const z = clamp(zoom, 1, 19);
  const bbox = bboxFromLatLng(la, ln, z);

  const embedUrl =
    `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
      bbox
    )}&layer=mapnik&marker=${encodeURIComponent(`${la},${ln}`)}`;

  const osmOpenUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
    String(la)
  )}&mlon=${encodeURIComponent(String(ln))}#map=${z}/${encodeURIComponent(
    String(la)
  )}/${encodeURIComponent(String(ln))}`;

  const googleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${la},${ln}`
  )}`;

  const appleNavUrl = `https://maps.apple.com/?daddr=${encodeURIComponent(
    `${la},${ln}`
  )}`;

  return (
    <div className={["space-y-2", className].join(" ")}>
      <div
        className="relative overflow-hidden rounded-2xl border border-yellow-400/15 bg-zinc-950/60"
        style={{ height: `${heightPx}px` }}
      >
        <iframe
          title="Карта объекта"
          src={embedUrl}
          className="h-full w-full"
          loading="lazy"
        />
        <a
          href={osmOpenUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-3 left-3 rounded-xl border border-yellow-400/15 bg-black/55 px-3 py-2 text-xs font-semibold text-zinc-100 shadow-[0_18px_60px_rgba(0,0,0,0.7)] backdrop-blur-sm hover:bg-black/70"
        >
          Открыть навигацию
        </a>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <a
          href={googleNavUrl}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-300 hover:text-zinc-100"
        >
          Google навигация
        </a>
        <a
          href={appleNavUrl}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-300 hover:text-zinc-100"
        >
          Apple навигация
        </a>
        <a
          href={osmOpenUrl}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-400 hover:text-zinc-200"
        >
          OpenStreetMap
        </a>
      </div>
    </div>
  );
}
