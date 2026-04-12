import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { langFromRequest } from "@/lib/request-lang";
import { parseI18nMap, resolveLocalizedField } from "@/lib/localized-records";

type SitePhoto = { path: string; url?: string; created_at?: string | null };

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!s) return { bucket: fallbackBucket };
  const parts = s.split("/").filter(Boolean);
  const bucket = (parts[0] || "").trim() || fallbackBucket;
  return { bucket };
}

const RAW_BUCKET = process.env.SITE_PHOTOS_BUCKET || "site-photos";
const { bucket: BUCKET } = parseBucketRef(RAW_BUCKET, "site-photos");

function getSignedTtlSeconds() {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL;
  const n = raw ? Number.parseInt(raw, 10) : 86400;
  return Number.isFinite(n) && n > 0 ? n : 86400;
}

function normalizePhotos(v: any): SitePhoto[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p) => p && typeof p === "object" && typeof (p as any).path === "string")
    .map((p) => ({
      path: String((p as any).path),
      url: (p as any).url ? String((p as any).url) : undefined,
      created_at: (p as any).created_at ? String((p as any).created_at) : undefined,
    }));
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req.headers);
    const lang = langFromRequest(req);

    const includeArchived = req.nextUrl.searchParams.get("include_archived") === "1";

    let q = supabase
      .from("sites")
      .select(
        "id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n",
      )
      .order("name", { ascending: true });

    if (!includeArchived) {
      q = q.is("archived_at", null);
    }

    const { data, error } = await q;
    if (error) {
      throw new ApiError(500, error.message || "Failed to load sites", ApiErrorCodes.SITE_LOAD_FAILED);
    }

    const sitesRaw = (data ?? []).map((s: any) => {
      const nameMap = parseI18nMap(s.name_i18n);
      const addressMap = parseI18nMap(s.address_i18n);
      const notesMap = parseI18nMap(s.notes_i18n);
      return {
        ...s,
        name: resolveLocalizedField(lang, s.name, nameMap),
        address: resolveLocalizedField(lang, s.address, addressMap),
        notes: s.notes == null ? null : resolveLocalizedField(lang, String(s.notes), notesMap),
        name_i18n: nameMap,
        address_i18n: addressMap,
        notes_i18n: notesMap,
        photos: normalizePhotos(s.photos),
      };
    });

    const allPaths = Array.from(
      new Set(
        sitesRaw
          .flatMap((s: any) => (Array.isArray(s.photos) ? s.photos : []))
          .map((p: any) => (p?.path ? String(p.path) : ""))
          .filter(Boolean),
      ),
    );

    const sites = sitesRaw;

    if (allPaths.length > 0) {
      const ttl = getSignedTtlSeconds();
      const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrls(allPaths, ttl);

      if (!signErr && Array.isArray(signed)) {
        const urlByPath = new Map<string, string>();
        for (const item of signed as any[]) {
          const p = item?.path ? String(item.path) : "";
          const u = item?.signedUrl ? String(item.signedUrl) : "";
          if (p && u) urlByPath.set(p, u);
        }

        for (const s of sites) {
          if (!Array.isArray((s as any).photos)) continue;
          (s as any).photos = (s as any).photos.map((p: any) => ({
            ...p,
            url: urlByPath.get(String(p.path)) || p.url,
          }));
        }
      }
    }

    return NextResponse.json({ sites }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
