import type { NextRequest } from "next/server";
import { DEFAULT_LANG, type Lang, parseLang } from "@/lib/i18n-config";

export function langFromRequest(req: NextRequest): Lang {
  const q = req.nextUrl.searchParams.get("lang");
  const fromQuery = parseLang(q);
  if (fromQuery) return fromQuery;

  const al = req.headers.get("accept-language");
  if (al) {
    const first = al.split(",")[0]?.trim().split("-")[0]?.toLowerCase();
    if (first === "ru") return "ru";
    if (first === "uk" || first === "ua") return "uk";
    if (first === "nl") return "nl";
    if (first === "en") return "en";
  }

  return DEFAULT_LANG;
}
