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

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const address = String(body?.address ?? "").trim();
    const radius = body?.radius ?? null;

    let lat: number | null =
      body?.lat === null || body?.lat === undefined ? null : Number(body.lat);
    let lng: number | null =
      body?.lng === null || body?.lng === undefined ? null : Number(body.lng);

    if (!name) throw new ApiError(400, "Название обязательно");

    const needsGeocode =
      address &&
      (!Number.isFinite(lat as number) || !Number.isFinite(lng as number));

    if (needsGeocode) {
      const g = await geocodeIfNeeded(req, address);
      lat = g.lat;
      lng = g.lng;
    }

    const payload: any = {
      name,
      address: address || null,
      radius: radius === null || radius === undefined ? null : Number(radius),
      lat: Number.isFinite(lat as number) ? lat : null,
      lng: Number.isFinite(lng as number) ? lng : null,
      category: body?.category ?? null,
      notes: body?.notes ?? null,
      archived_at: null,
    };

    const { data, error } = await supabase
      .from("sites")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw new ApiError(500, error.message);

    return NextResponse.json({ site: data });
  } catch (e) {
    return toErrorResponse(e);
  }
}
