import { NextRequest, NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { shapeSiteForAdmin } from "@/lib/admin-sites-shape.server";
import { localPhotoBucket } from "@/lib/server/local-photo-storage";
import { requestLocale } from "@/lib/request-lang";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/route-db";

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

function normalizePhotos(v: unknown): SitePhoto[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p) => p && typeof p === "object" && typeof (p as { path?: string }).path === "string")
    .map((p) => ({
      path: String((p as { path: string }).path),
      url: (p as { url?: string }).url ? String((p as { url?: string }).url) : undefined,
      created_at: (p as { created_at?: string }).created_at
        ? String((p as { created_at?: string }).created_at)
        : undefined,
    }));
}

const SITE_FIELDS =
  "id,name,address,lat,lng,radius,category,notes,photos,archived_at,name_i18n,address_i18n,notes_i18n";

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireAdmin(req.headers);
    const loc = requestLocale(req);

    const includeArchived = req.nextUrl.searchParams.get("include_archived") === "1";

    let q = db.from("sites").select(SITE_FIELDS).order("name", { ascending: true });

    if (!includeArchived) {
      q = q.is("archived_at", null);
    }

    const { data, error } = await q;
    if (error) throw new ApiError(500, error.message || "Load failed", AdminApiErrorCode.SITES_LOAD_FAILED);

    const sites = (data ?? []).map((s: Record<string, unknown>) => ({
      ...shapeSiteForAdmin(s, loc),
      photos: normalizePhotos(s.photos),
    })) as Array<ReturnType<typeof shapeSiteForAdmin> & { photos: SitePhoto[] }>;

    const allPaths = Array.from(
      new Set(
        sites
          .flatMap((s) => s.photos)
          .map((p) => (p?.path ? String(p.path) : ""))
          .filter(Boolean),
      ),
    );

    if (allPaths.length > 0) {
      const ttl = getSignedTtlSeconds();
      const { data: signed, error: signErr } = await localPhotoBucket(BUCKET).createSignedUrls(allPaths, ttl);

      if (!signErr && Array.isArray(signed)) {
        const urlByPath = new Map<string, string>();
        for (const item of signed as { path?: string; signedUrl?: string }[]) {
          const p = item?.path ? String(item.path) : "";
          const u = item?.signedUrl ? String(item.signedUrl) : "";
          if (p && u) urlByPath.set(p, u);
        }

        for (const s of sites) {
          if (!Array.isArray(s.photos)) continue;
          s.photos = s.photos.map((p: SitePhoto) => ({
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
