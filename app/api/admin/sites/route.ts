import { NextResponse } from "next/server";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { fillEmptyFromRuFields } from "@/lib/deepl-fill.server";
import { mergeI18nMap, parseI18nMap } from "@/lib/localized-records";

export const runtime = "nodejs";

function toFiniteOrNull(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toCategoryOrNull(v: any): number | null {
  if (v == null || v === "" || v === 0 || v === "0") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 15) {
    throw new ApiError(400, "Category must be between 1 and 15", ApiErrorCodes.SITE_CATEGORY_RANGE);
  }
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
    const { supabase } = await requireAdmin(req.headers);
    const body = await req.json();

    const name = (body?.name ?? "").toString().trim();
    const address = body?.address == null ? null : String(body.address).trim() || null;

    let lat = toFiniteOrNull(body?.lat);
    let lng = toFiniteOrNull(body?.lng);

    const radius = toFiniteOrNull(body?.radius ?? body?.radius_m);
    const category = toCategoryOrNull(body?.category);
    const notes = body?.notes == null ? null : String(body.notes);

    let name_i18n = mergeI18nMap({}, parseI18nMap(body?.name_i18n));
    let address_i18n = mergeI18nMap({}, parseI18nMap(body?.address_i18n));
    let notes_i18n = mergeI18nMap({}, parseI18nMap(body?.notes_i18n));

    const fillMissingTranslations = Boolean(body?.fillMissingTranslations);

    if (!name) {
      throw new ApiError(400, "Site name is required", ApiErrorCodes.SITE_NAME_REQUIRED);
    }
    const safeRadius = radius != null ? radius : 150;

    if (address && (lat == null || lng == null)) {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    if (fillMissingTranslations) {
      const filled = await fillEmptyFromRuFields({
        name: { ru: name, map: name_i18n },
        address: { ru: address || "", map: address_i18n },
        notes: { ru: notes || "", map: notes_i18n },
      });
      if (filled.name_i18n) name_i18n = filled.name_i18n;
      if (filled.address_i18n) address_i18n = filled.address_i18n;
      if (filled.notes_i18n) notes_i18n = filled.notes_i18n;
    }

    const { data, error } = await supabase
      .from("sites")
      .insert({
        name,
        address,
        lat,
        lng,
        radius: safeRadius,
        category,
        notes,
        name_i18n,
        address_i18n,
        notes_i18n,
        photos: [],
      })
      .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n")
      .single();

    if (error) {
      throw new ApiError(500, error.message || "Failed to create site", ApiErrorCodes.SITE_CREATE_FAILED);
    }

    return NextResponse.json({ site: data }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
