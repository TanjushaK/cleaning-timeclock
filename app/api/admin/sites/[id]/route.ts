import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { fillEmptyFromRuFields } from "@/lib/deepl-fill.server";
import { langFromRequest } from "@/lib/request-lang";
import { mergeI18nMap, parseI18nMap, resolveLocalizedField } from "@/lib/localized-records";

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

async function getSiteIdFromCtx(ctx: any): Promise<string> {
  const p = await Promise.resolve(ctx?.params);
  const id = String(p?.id || "").trim();
  if (!id) throw new ApiError(400, "Missing site id", ApiErrorCodes.MISSING_SITE_ID);
  return id;
}

function mapSiteRow(row: any, lang: ReturnType<typeof langFromRequest>) {
  const nameMap = parseI18nMap(row.name_i18n);
  const addressMap = parseI18nMap(row.address_i18n);
  const notesMap = parseI18nMap(row.notes_i18n);
  return {
    ...row,
    name: resolveLocalizedField(lang, row.name, nameMap),
    address: resolveLocalizedField(lang, row.address, addressMap),
    notes: row.notes == null ? null : resolveLocalizedField(lang, String(row.notes), notesMap),
    name_i18n: nameMap,
    address_i18n: addressMap,
    notes_i18n: notesMap,
  };
}

export async function GET(req: NextRequest, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const siteId = await getSiteIdFromCtx(ctx);
    const lang = langFromRequest(req);

    const { data, error } = await supabase
      .from("sites")
      .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n")
      .eq("id", siteId)
      .single();

    if (error) {
      throw new ApiError(404, "Site not found", ApiErrorCodes.SITE_NOT_FOUND);
    }

    return NextResponse.json({ site: mapSiteRow(data, lang) }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: NextRequest, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const siteId = await getSiteIdFromCtx(ctx);
    const body = await req.json().catch(() => ({}));

    const name = body?.name == null ? undefined : String(body.name).trim();
    const address = body?.address == null ? undefined : String(body.address).trim() || null;

    const lat = body?.lat === undefined ? undefined : toFiniteOrNull(body.lat);
    const lng = body?.lng === undefined ? undefined : toFiniteOrNull(body.lng);

    const radiusRaw = body?.radius ?? body?.radius_m;
    const radius = radiusRaw === undefined ? undefined : toFiniteOrNull(radiusRaw);

    const category = body?.category === undefined ? undefined : toCategoryOrNull(body.category);
    const notes = body?.notes === undefined ? undefined : body.notes == null ? null : String(body.notes);

    const fillMissingTranslations = Boolean(body?.fillMissingTranslations);

    const { data: existing, error: exErr } = await supabase
      .from("sites")
      .select("id,name,address,notes,name_i18n,address_i18n,notes_i18n")
      .eq("id", siteId)
      .single();

    if (exErr || !existing) {
      throw new ApiError(404, "Site not found", ApiErrorCodes.SITE_NOT_FOUND);
    }

    let name_i18n = mergeI18nMap(parseI18nMap(existing.name_i18n), body?.name_i18n === undefined ? null : parseI18nMap(body.name_i18n));
    let address_i18n = mergeI18nMap(
      parseI18nMap(existing.address_i18n),
      body?.address_i18n === undefined ? null : parseI18nMap(body.address_i18n),
    );
    let notes_i18n = mergeI18nMap(
      parseI18nMap(existing.notes_i18n),
      body?.notes_i18n === undefined ? null : parseI18nMap(body.notes_i18n),
    );

    const ruName = name !== undefined ? name : String(existing.name ?? "");
    const ruAddress = address !== undefined ? address : String(existing.address ?? "");
    const ruNotes = notes !== undefined ? notes ?? "" : String(existing.notes ?? "");

    if (fillMissingTranslations) {
      const filled = await fillEmptyFromRuFields({
        name: { ru: ruName, map: name_i18n },
        address: { ru: ruAddress || "", map: address_i18n },
        notes: { ru: ruNotes || "", map: notes_i18n },
      });
      if (filled.name_i18n) name_i18n = filled.name_i18n;
      if (filled.address_i18n) address_i18n = filled.address_i18n;
      if (filled.notes_i18n) notes_i18n = filled.notes_i18n;
    }

    const patch: any = {};
    if (name !== undefined) patch.name = name;
    if (address !== undefined) patch.address = address;
    if (lat !== undefined) patch.lat = lat;
    if (lng !== undefined) patch.lng = lng;
    if (radius !== undefined) patch.radius = radius;
    if (category !== undefined) patch.category = category;
    if (notes !== undefined) patch.notes = notes;
    if (body?.name_i18n !== undefined || fillMissingTranslations) patch.name_i18n = name_i18n;
    if (body?.address_i18n !== undefined || fillMissingTranslations) patch.address_i18n = address_i18n;
    if (body?.notes_i18n !== undefined || fillMissingTranslations) patch.notes_i18n = notes_i18n;

    if (Object.keys(patch).length === 0) {
      const lang = langFromRequest(req);
      const { data, error } = await supabase
        .from("sites")
        .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n")
        .eq("id", siteId)
        .single();

      if (error) {
        throw new ApiError(404, "Site not found", ApiErrorCodes.SITE_NOT_FOUND);
      }
      return NextResponse.json({ site: mapSiteRow(data, lang) }, { status: 200 });
    }

    if (patch.name !== undefined && !patch.name) {
      throw new ApiError(400, "Site name is required", ApiErrorCodes.SITE_NAME_REQUIRED);
    }

    const { data, error } = await supabase
      .from("sites")
      .update(patch)
      .eq("id", siteId)
      .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n")
      .single();

    if (error) {
      throw new ApiError(500, error.message || "Failed to update site", ApiErrorCodes.SITE_UPDATE_FAILED);
    }

    const lang = langFromRequest(req);
    return NextResponse.json({ site: mapSiteRow(data, lang) }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const siteId = await getSiteIdFromCtx(ctx);

    const { error } = await supabase.from("sites").delete().eq("id", siteId);

    if (error) {
      throw new ApiError(
        409,
        `Cannot delete site: ${error.message}`,
        ApiErrorCodes.SITE_DELETE_CONFLICT,
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
