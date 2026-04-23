import { NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { shapeSiteForAdmin } from "@/lib/admin-sites-shape.server";
import { fillMissingLocalesFromRu } from "@/lib/deepl-fill.server";
import type { I18nJson } from "@/lib/localized-records";
import { requestLocale } from "@/lib/request-lang";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/route-db";

export const runtime = "nodejs";

const SITE_FIELDS =
  "id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n";

function toFiniteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toCategoryOrNull(v: unknown): number | null {
  if (v == null || v === "" || v === 0 || v === "0") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 15) throw new ApiError(400, "Category must be 1–15", AdminApiErrorCode.SITE_CATEGORY_INVALID);
  return i;
}

type NominatimItem = { lat: string; lon: string; display_name?: string };

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim();
  if (!q) return null;

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      limit: "1",
    }).toString();

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "CleaningTimeclock/1.0 (admin sites geocoder)",
        Accept: "application/json",
      },
      signal: ac.signal,
      cache: "no-store",
    });

    if (!res.ok) return null;
    const arr = (await res.json()) as NominatimItem[];
    const item = arr?.[0];
    if (!item?.lat || !item?.lon) return null;

    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  try {
    const { db } = await requireAdmin(req.headers);
    const body = await req.json();
    const loc = requestLocale(req);

    const name = (body?.name ?? "").toString().trim();
    const address = body?.address == null ? null : String(body.address).trim() || null;

    let lat = toFiniteOrNull(body?.lat);
    let lng = toFiniteOrNull(body?.lng);

    const radius = toFiniteOrNull(body?.radius ?? body?.radius_m);
    const category = toCategoryOrNull(body?.category);
    const notes = body?.notes == null ? null : String(body.notes);

    if (!name) throw new ApiError(400, "Site name required", AdminApiErrorCode.SITE_NAME_REQUIRED);
    const safeRadius = radius != null ? radius : 150;

    if (address && (lat == null || lng == null)) {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    let nameI18n: I18nJson = { ru: name };
    let addressI18n: I18nJson = address ? { ru: address } : {};
    let notesI18n: I18nJson = notes ? { ru: notes } : {};

    const fill = body?.fillMissingTranslations === true;
    if (fill) {
      try {
        nameI18n = await fillMissingLocalesFromRu(name, nameI18n, ["en", "uk", "nl"]);
        if (address) {
          addressI18n = await fillMissingLocalesFromRu(address, addressI18n, ["en", "uk", "nl"]);
        }
        if (notes) {
          notesI18n = await fillMissingLocalesFromRu(notes, notesI18n, ["en", "uk", "nl"]);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "DEEPL_NOT_CONFIGURED") {
          throw new ApiError(503, "DeepL not configured", AdminApiErrorCode.DEEPL_NOT_CONFIGURED);
        }
        throw e;
      }
    }

    const { data, error } = await db
      .from("sites")
      .insert({
        name,
        address,
        lat,
        lng,
        radius: safeRadius,
        category,
        notes,
        photos: [],
        name_i18n: nameI18n,
        address_i18n: addressI18n,
        notes_i18n: notesI18n,
      })
      .select(SITE_FIELDS)
      .single();

    if (error) throw new ApiError(500, error.message || "Create failed", AdminApiErrorCode.SITE_CREATE_FAILED);

    return NextResponse.json({ site: shapeSiteForAdmin(data as Record<string, unknown>, loc) }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
