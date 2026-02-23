import { NextRequest, NextResponse } from "next/server";
import { POST as postPhotos, DELETE as deletePhoto } from "../sites/[id]/photos/route";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SitePhoto = { path: string; url?: string; created_at?: string | null };

function getId(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) throw new ApiError(400, "id_required");
  return id;
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
    const { supabase } = await requireAdmin(req.headers);

    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || "");
    const path = String(body?.path || "").trim();

    if (action !== "make_primary") throw new ApiError(400, "unsupported_action");
    if (!path) throw new ApiError(400, "path_required");

    const { data: siteData, error: siteErr } = await supabase
      .from("sites")
      .select("id,name,address,lat,lng,radius,category,notes,photos,archived_at")
      .eq("id", id)
      .single();

    if (siteErr) throw new ApiError(404, siteErr.message || "site_not_found");

    const photos = normalizePhotos(siteData?.photos);
    const idx = photos.findIndex((p) => p.path === path);
    if (idx < 0) throw new ApiError(404, "photo_not_found");

    const nextPhotos = [photos[idx], ...photos.filter((_, i) => i !== idx)];

    const { data: updated, error: updErr } = await supabase
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
