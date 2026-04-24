import { NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { shapeSiteForAdmin } from "@/lib/admin-sites-shape.server";
import { fillMissingLocalesFromRu } from "@/lib/deepl-fill.server";
import {
  geocodeAddressViaNominatim,
  normalizeRadius,
  siteCoordinatesMissingErrorMessage,
  siteHasCoordinates,
} from "@/lib/server/admin-geocode";
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
    const safeRadius = normalizeRadius(radius);

    if (address && (lat == null || lng == null)) {
      const geo = await geocodeAddressViaNominatim(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }

    if (!siteHasCoordinates(lat, lng, safeRadius)) {
      throw new ApiError(
        400,
        siteCoordinatesMissingErrorMessage(),
        AdminApiErrorCode.SITE_COORDINATES_REQUIRED,
      );
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
