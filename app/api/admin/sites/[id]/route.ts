import { NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { shapeSiteForAdmin } from "@/lib/admin-sites-shape.server";
import { fillMissingLocalesFromRu } from "@/lib/deepl-fill.server";
import { parseLang, type Lang } from "@/lib/i18n-config";
import type { I18nJson } from "@/lib/localized-records";
import { parseI18nJson, ruSourceText, setI18nLocale } from "@/lib/localized-records";
import { requestLocale } from "@/lib/request-lang";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

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

async function getSiteIdFromCtx(ctx: { params?: Promise<{ id?: string }> }): Promise<string> {
  const p = await Promise.resolve(ctx?.params);
  const id = String(p?.id || "").trim();
  if (!id) throw new ApiError(400, "Missing site id", AdminApiErrorCode.SITE_ID_REQUIRED);
  return id;
}

function normTextField(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const siteId = await getSiteIdFromCtx(ctx);
    const loc = requestLocale(req);

    const { data, error } = await supabase.from("sites").select(SITE_FIELDS).eq("id", siteId).single();

    if (error || !data) throw new ApiError(404, "Site not found", AdminApiErrorCode.SITE_NOT_FOUND);

    return NextResponse.json({ site: shapeSiteForAdmin(data as Record<string, unknown>, loc) }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const siteId = await getSiteIdFromCtx(ctx);
    const loc = requestLocale(req);
    const body = await req.json().catch(() => ({}));

    const { data: existing, error: exErr } = await supabase
      .from("sites")
      .select(SITE_FIELDS)
      .eq("id", siteId)
      .single();

    if (exErr || !existing) throw new ApiError(404, "Site not found", AdminApiErrorCode.SITE_NOT_FOUND);

    const row = existing as Record<string, unknown>;

    if (body?.fillMissingTranslations === true) {
      const apiKey = process.env.DEEPL_API_KEY?.trim();
      if (!apiKey) {
        throw new ApiError(503, "DeepL not configured", AdminApiErrorCode.DEEPL_NOT_CONFIGURED);
      }

      let nameI18n = parseI18nJson(row.name_i18n);
      let addressI18n = parseI18nJson(row.address_i18n);
      let notesI18n = parseI18nJson(row.notes_i18n);

      const ruName = ruSourceText(nameI18n, row.name as string | null);
      try {
        nameI18n = await fillMissingLocalesFromRu(ruName, nameI18n, ["en", "uk", "nl"]);
        const ruAddr = ruSourceText(addressI18n, row.address as string | null);
        if (ruAddr) addressI18n = await fillMissingLocalesFromRu(ruAddr, addressI18n, ["en", "uk", "nl"]);
        const ruNotes = ruSourceText(notesI18n, row.notes as string | null);
        if (ruNotes) notesI18n = await fillMissingLocalesFromRu(ruNotes, notesI18n, ["en", "uk", "nl"]);
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "DEEPL_NOT_CONFIGURED") {
          throw new ApiError(503, "DeepL not configured", AdminApiErrorCode.DEEPL_NOT_CONFIGURED);
        }
        throw e;
      }

      const { data: updated, error: updErr } = await supabase
        .from("sites")
        .update({ name_i18n: nameI18n, address_i18n: addressI18n, notes_i18n: notesI18n })
        .eq("id", siteId)
        .select(SITE_FIELDS)
        .single();

      if (updErr) throw new ApiError(500, updErr.message || "Update failed", AdminApiErrorCode.SITE_UPDATE_FAILED);
      return NextResponse.json({ site: shapeSiteForAdmin(updated as Record<string, unknown>, loc) }, { status: 200 });
    }

    const editLocale: Lang = parseLang(body?.editLocale) ?? "ru";

    const touchesText =
      Object.prototype.hasOwnProperty.call(body, "name") ||
      Object.prototype.hasOwnProperty.call(body, "address") ||
      Object.prototype.hasOwnProperty.call(body, "notes");

    let nameI18n: I18nJson = parseI18nJson(row.name_i18n);
    let addressI18n: I18nJson = parseI18nJson(row.address_i18n);
    let notesI18n: I18nJson = parseI18nJson(row.notes_i18n);

    const patch: Record<string, unknown> = {};

    if (body?.name !== undefined) {
      const v = normTextField(body.name);
      nameI18n = setI18nLocale(nameI18n, editLocale, v);
      if (editLocale === "ru") {
        if (!v) throw new ApiError(400, "Site name required", AdminApiErrorCode.SITE_NAME_REQUIRED);
        patch.name = v;
      }
    }

    if (body?.address !== undefined) {
      const v = normTextField(body.address);
      addressI18n = setI18nLocale(addressI18n, editLocale, v);
      if (editLocale === "ru") patch.address = v;
    }

    if (body?.notes !== undefined) {
      const v = normTextField(body.notes);
      notesI18n = setI18nLocale(notesI18n, editLocale, v);
      if (editLocale === "ru") patch.notes = v;
    }

    if (touchesText) {
      patch.name_i18n = nameI18n;
      patch.address_i18n = addressI18n;
      patch.notes_i18n = notesI18n;
    }

    if (body?.lat !== undefined) patch.lat = toFiniteOrNull(body.lat);
    if (body?.lng !== undefined) patch.lng = toFiniteOrNull(body.lng);
    const radiusRaw = body?.radius ?? body?.radius_m;
    if (radiusRaw !== undefined) patch.radius = toFiniteOrNull(radiusRaw);
    if (body?.category !== undefined) patch.category = toCategoryOrNull(body.category);

    if (Object.keys(patch).length === 0) {
      const { data, error } = await supabase.from("sites").select(SITE_FIELDS).eq("id", siteId).single();

      if (error) throw new ApiError(404, "Site not found", AdminApiErrorCode.SITE_NOT_FOUND);
      return NextResponse.json({ site: shapeSiteForAdmin(data as Record<string, unknown>, loc) }, { status: 200 });
    }

    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      const n = patch.name as string | null;
      if (!n || !String(n).trim()) throw new ApiError(400, "Site name required", AdminApiErrorCode.SITE_NAME_REQUIRED);
    }

    const { data, error } = await supabase
      .from("sites")
      .update(patch)
      .eq("id", siteId)
      .select(SITE_FIELDS)
      .single();

    if (error) throw new ApiError(500, error.message || "Update failed", AdminApiErrorCode.SITE_UPDATE_FAILED);

    return NextResponse.json({ site: shapeSiteForAdmin(data as Record<string, unknown>, loc) }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const siteId = await getSiteIdFromCtx(ctx);

    const { error } = await supabase.from("sites").delete().eq("id", siteId);

    if (error) {
      throw new ApiError(
        409,
        `Could not delete site: ${error.message}`,
        AdminApiErrorCode.SITE_DELETE_FAILED,
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
