import { NextRequest, NextResponse } from "next/server";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export const runtime = "nodejs";

async function geocodeIfNeeded(req: NextRequest, address: string) {
  const origin = req.nextUrl.origin;
  const url = new URL("/api/geocode", origin);
  url.searchParams.set("q", address);

  const r = await fetch(url.toString(), { method: "GET" });
  const j = await r.json().catch(() => null);

  if (!r.ok || !j?.ok) return { lat: null as number | null, lng: null as number | null };
  const lat = Number(j.lat);
  const lng = Number(j.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
  return { lat, lng };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await requireAdmin(req);
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));

    const name = body?.name !== undefined ? String(body.name).trim() : undefined;
    const address = body?.address !== undefined ? String(body.address).trim() : undefined;

    const radius = body?.radius === undefined ? undefined : body.radius;
    const category = body?.category === undefined ? undefined : body.category;
    const notes = body?.notes === undefined ? undefined : body.notes;

    let lat: number | null | undefined =
      body?.lat === undefined ? undefined : body.lat === null ? null : Number(body.lat);
    let lng: number | null | undefined =
      body?.lng === undefined ? undefined : body.lng === null ? null : Number(body.lng);

    // если прислали адрес, но не прислали координаты — геокодим
    const needsGeocode =
      address !== undefined &&
      address.trim() &&
      (lat === undefined || lng === undefined || !Number.isFinite(lat as number) || !Number.isFinite(lng as number));

    if (needsGeocode) {
      const g = await geocodeIfNeeded(req, address.trim());
      lat = g.lat;
      lng = g.lng;
    }

    const patch: any = {};
    if (name !== undefined) patch.name = name;
    if (address !== undefined) patch.address = address || null;
    if (radius !== undefined) patch.radius = radius === null ? null : Number(radius);
    if (category !== undefined) patch.category = category;
    if (notes !== undefined) patch.notes = notes;

    if (lat !== undefined) patch.lat = Number.isFinite(lat as number) ? lat : null;
    if (lng !== undefined) patch.lng = Number.isFinite(lng as number) ? lng : null;

    const { data, error } = await supabase
      .from("sites")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new ApiError(500, error.message);
    return NextResponse.json({ site: data });
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

    // 1) отвязываем jobs
    const upd = await supabase.from("jobs").update({ site_id: null }).eq("site_id", id);
    if (upd.error) {
      // чаще всего это NOT NULL или права/rls
      throw new ApiError(409, upd.error.message);
    }

    // 2) чистим assignments (обычно там FK на site_id)
    const delAssign = await supabase.from("assignments").delete().eq("site_id", id);
    if (delAssign.error) throw new ApiError(409, delAssign.error.message);

    // 3) удаляем сам объект
    const delSite = await supabase.from("sites").delete().eq("id", id);
    if (delSite.error) throw new ApiError(409, delSite.error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
