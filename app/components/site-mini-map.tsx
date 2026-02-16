"use client";

import React from "react";

type Props = {
  lat: number | null | undefined;
  lng: number | null | undefined;
  title?: string;
  className?: string;
  heightClassName?: string;
};

function buildOsmEmbedUrl(lat: number, lng: number) {
  // как на твоём скрине: bbox +/- 0.004
  const pad = 0.004;
  const left = lng - pad;
  const right = lng + pad;
  const bottom = lat - pad;
  const top = lat + pad;

  const bbox = `${left}%2C${bottom}%2C${right}%2C${top}`;
  const marker = `${lat}%2C${lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}

function buildGoogleNav(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function buildAppleNav(lat: number, lng: number) {
  return `http://maps.apple.com/?daddr=${lat},${lng}`;
}

export default function SiteMiniMap({
  lat,
  lng,
  title = "Карта",
  className = "",
  heightClassName = "h-[220px]",
}: Props) {
  const has = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <div className={`mt-4 ${className}`}>
      <div className="mb-2 text-sm font-semibold text-zinc-200">{title}</div>

      {!has ? (
        <div className="rounded-2xl border border-yellow-400/15 bg-zinc-950/60 p-4 text-sm text-zinc-400">
          Нет координат — сначала получи lat/lng по адресу.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-yellow-400/15 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
          <div className={`w-full ${heightClassName}`}>
            <iframe
              title="OSM"
              src={buildOsmEmbedUrl(lat as number, lng as number)}
              className="h-full w-full"
              loading="lazy"
            />
          </div>

          <div className="flex flex-wrap gap-4 px-4 py-3 text-xs">
            <a
              href={buildGoogleNav(lat as number, lng as number)}
              target="_blank"
              rel="noreferrer"
              className="text-yellow-200/90 hover:text-yellow-200 underline underline-offset-4"
            >
              Google навигация
            </a>
            <a
              href={buildAppleNav(lat as number, lng as number)}
              target="_blank"
              rel="noreferrer"
              className="text-yellow-200/90 hover:text-yellow-200 underline underline-offset-4"
            >
              Apple навигация
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
