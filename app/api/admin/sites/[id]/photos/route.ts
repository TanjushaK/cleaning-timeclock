import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export const runtime = "nodejs";

const DEFAULT_BUCKET = "site-photos";
const DEFAULT_TTL = 86400;

function getBucket() {
  return process.env.SITE_PHOTOS_BUCKET || DEFAULT_BUCKET;
}

function getTtl() {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL;
  const n = raw ? Number(raw) : DEFAULT_TTL;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TTL;
}

type Photo = {
  path?: string;
  url?: string;
  created_at?: string;
};

async function withSignedUrls(supabase: any, photos: Photo[] | null) {
  const bucket = getBucket();
  const ttl = getTtl();

  const arr = Array.isArray(photos) ? photos : [];
  const out = await Promise.all(
    arr.map(async (p) => {
      const path = typeof p?.path === "string" ? p.path : "";
      if (!path) return p;

      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
      if (error || !data?.signedUrl) return { ...p, url: p.url };

      return { ...p, url: data.signedUrl };
    })
  );
  return out;
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireAdmin(req);
    const { id } = await ctx.params;

    const bucket = getBucket();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) throw new ApiError(400, "Файл не найден");

    const { data: siteRow, error: siteErr } = await supabase
      .from("sites")
      .select("id, photos")
      .eq("id", id)
      .single();

    if (siteErr) throw new ApiError(404, siteErr.message);

    const existing: Photo[] = Array.isArray(siteRow.photos) ? siteRow.photos : [];
    if (existing.length >= 5) throw new ApiError(400, "Максимум 5 фото");

    const path = `sites/${id}/${Date.now()}-${safeName(file.name || "photo")}`;

    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (upErr) throw new ApiError(500, upErr.message);

    const nextPhotos: Photo[] = [
      ...existing,
      { path, created_at: new Date().toISOString() },
    ];

    const { error: updErr } = await supabase
      .from("sites")
      .update({ photos: nextPhotos })
      .eq("id", id);

    if (updErr) throw new ApiError(500, updErr.message);

    const { data: updated, error: readErr } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .single();

    if (readErr) throw new ApiError(500, readErr.message);

    updated.photos = await withSignedUrls(supabase, updated.photos);

    return NextResponse.json({ site: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireAdmin(req);
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const { data: siteRow, error: siteErr } = await supabase
      .from("sites")
      .select("id, photos")
      .eq("id", id)
      .single();

    if (siteErr) throw new ApiError(404, siteErr.message);

    const photos: Photo[] = Array.isArray(siteRow.photos) ? siteRow.photos : [];

    if (action === "make_primary") {
      const path = String(body?.path ?? "");
      const idx = photos.findIndex((p) => p.path === path);
      if (idx < 0) throw new ApiError(404, "Фото не найдено");

      const [picked] = photos.splice(idx, 1);
      const next = [picked, ...photos];

      const { error: updErr } = await supabase
        .from("sites")
        .update({ photos: next })
        .eq("id", id);

      if (updErr) throw new ApiError(500, updErr.message);

      const { data: updated, error: readErr } = await supabase
        .from("sites")
        .select("*")
        .eq("id", id)
        .single();

      if (readErr) throw new ApiError(500, readErr.message);

      updated.photos = await withSignedUrls(supabase, updated.photos);
      return NextResponse.json({ site: updated });
    }

    throw new ApiError(400, "Неизвестное действие");
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireAdmin(req);
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const path = String(body?.path ?? "");
    if (!path) throw new ApiError(400, "path обязателен");

    const bucket = getBucket();

    const { data: siteRow, error: siteErr } = await supabase
      .from("sites")
      .select("id, photos")
      .eq("id", id)
      .single();

    if (siteErr) throw new ApiError(404, siteErr.message);

    const photos: Photo[] = Array.isArray(siteRow.photos) ? siteRow.photos : [];
    const next = photos.filter((p) => p.path !== path);

    // удаляем объект из storage (ошибку удаления из storage не превращаем в падение БД)
    await supabase.storage.from(bucket).remove([path]);

    const { error: updErr } = await supabase
      .from("sites")
      .update({ photos: next })
      .eq("id", id);

    if (updErr) throw new ApiError(500, updErr.message);

    const { data: updated, error: readErr } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .single();

    if (readErr) throw new ApiError(500, readErr.message);

    updated.photos = await withSignedUrls(supabase, updated.photos);
    return NextResponse.json({ site: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}
