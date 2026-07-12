import { NextRequest, NextResponse } from "next/server";
import { POST as postPhotos, DELETE as deletePhoto } from "../sites/[id]/photos/route";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/route-db";
import { withCookieBearer } from "@/lib/server/with-cookie-bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"
const TANJUSHA_PHOTO_UPLOAD_LIMIT_MB = 25
const TANJUSHA_PHOTO_UPLOAD_LIMIT_BYTES = TANJUSHA_PHOTO_UPLOAD_LIMIT_MB * 1024 * 1024

function tanjushaPhotoTooLargeResponse() {
  return Response.json(
    { ok: false, error: '\u0424\u043e\u0442\u043e \u0431\u043e\u043b\u044c\u0448\u0435 25 MB', code: 'PHOTO_TOO_LARGE' },
    { status: 413 },
  )
}

function tanjushaPhotoParseFailedResponse() {
  return Response.json(
    { ok: false, error: '\u0424\u043e\u0442\u043e \u0431\u043e\u043b\u044c\u0448\u0435 25 MB \u0438\u043b\u0438 \u0444\u0430\u0439\u043b \u043f\u043e\u0432\u0440\u0435\u0436\u0434\u0451\u043d', code: 'PHOTO_FORMDATA_PARSE_FAILED' },
    { status: 413 },
  )
}

function isTanjushaPhotoUploadTooLarge(request: Request) {
  const raw = request.headers.get('content-length')
  if (!raw) return false
  const n = Number(raw)
  return Number.isFinite(n) && n > TANJUSHA_PHOTO_UPLOAD_LIMIT_BYTES
}

async function readTanjushaPhotoFormData(request: Request): Promise<{ formData: FormData } | { response: Response }> {
  if (isTanjushaPhotoUploadTooLarge(request)) return { response: tanjushaPhotoTooLargeResponse() }

  try {
    return { formData: await request.formData() }
  } catch {
    return { response: tanjushaPhotoParseFailedResponse() }
  }
}
;

type SitePhoto = { path: string; url?: string; created_at?: string | null };

function getId(req: NextRequest) {
  const fromQuery = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (fromQuery) return fromQuery;

  const pathname = req.nextUrl.pathname || "";
  const pretty = pathname.match(/^\/api\/admin\/sites\/([^/]+)\/photos$/);
  if (pretty?.[1]) return pretty[1];

  throw new ApiError(400, "id_required");
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

export async function POST(req: NextRequest) {
  try {
    const id = getId(req);
    return await postPhotos(req as any, { params: Promise.resolve({ id }) } as any);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = getId(req);
    return await deletePhoto(req as any, { params: Promise.resolve({ id }) } as any);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const id = getId(req);
    const { db } = await requireAdmin(withCookieBearer(req));

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "");
    const path = String(body?.path || "").trim();

    if (action !== "make_primary") throw new ApiError(400, "unsupported_action");
    if (!path) throw new ApiError(400, "path_required");

    const { data: siteData, error: siteErr } = await db
      .from("sites")
      .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at")
      .eq("id", id)
      .single();

    if (siteErr) throw new ApiError(404, siteErr.message || "site_not_found");

    const photos = normalizePhotos(siteData?.photos);
    const idx = photos.findIndex((p) => p.path === path);
    if (idx < 0) throw new ApiError(404, "photo_not_found");

    const nextPhotos = [photos[idx], ...photos.filter((_, i) => i !== idx)];

    const { data: updated, error: updErr } = await db
      .from("sites")
      .update({ photos: nextPhotos })
      .eq("id", id)
      .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at")
      .single();

    if (updErr) throw new ApiError(500, updErr.message || "db_update_failed");

    return NextResponse.json({ site: updated }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
