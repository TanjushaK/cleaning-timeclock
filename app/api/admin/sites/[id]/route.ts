import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function asNum(v: unknown): number | null | undefined {
  // undefined => field not provided
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function geocodeIfNeeded(req: NextRequest, address: string) {
  const q = safeStr(address);
  if (!q) return null;

  // Use our internal API (it already sets User-Agent via env).
  const url = new URL("/api/geocode", req.nextUrl.origin);
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!res.ok) return null;

  const data = (await res.json()) as any;
  if (!data?.ok) return null;

  const lat = asNum(data?.lat);
  const lng = asNum(data?.lng);
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return { lat, lng };
}

async function handleUpdate(req: NextRequest, id: string) {
  const { supabase } = await requireAdmin(req);

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  // Support both {category} and {categoryId}
  const categoryRaw = payload?.category ?? payload?.categoryId;

  const name = payload?.name;
  const address = payload?.address;
  const radius = payload?.radius;
  const latRaw = payload?.lat;
  const lngRaw = payload?.lng;
  const notes = payload?.notes;

  // Only include fields that were actually sent.
  const patch: Record<string, any> = {};

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    patch.name = typeof name === "string" ? name : safeStr(name);
  }

  const addressProvided = Object.prototype.hasOwnProperty.call(payload, "address");
  if (addressProvided) {
    patch.address = typeof address === "string" ? address : safeStr(address);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "radius")) {
    const r = asNum(radius);
    patch.radius = typeof r === "number" ? r : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "notes")) {
    patch.notes = notes === null ? null : String(notes ?? "");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "category") || Object.prototype.hasOwnProperty.call(payload, "categoryId")) {
    if (categoryRaw === null) patch.category = null;
    else if (typeof categoryRaw === "number") patch.category = categoryRaw;
    else if (typeof categoryRaw === "string" && categoryRaw.trim() !== "") patch.category = Number(categoryRaw);
    else patch.category = null;
  }

  const latProvided = Object.prototype.hasOwnProperty.call(payload, "lat");
  const lngProvided = Object.prototype.hasOwnProperty.call(payload, "lng");

  if (latProvided) {
    const v = asNum(latRaw);
    patch.lat = typeof v === "number" ? v : null;
  }
  if (lngProvided) {
    const v = asNum(lngRaw);
    patch.lng = typeof v === "number" ? v : null;
  }

  // If address changed but coords weren't explicitly provided (or cleared), try geocoding.
  const shouldGeocode =
    addressProvided &&
    safeStr(patch.address).length > 0 &&
    (!latProvided || patch.lat === null) &&
    (!lngProvided || patch.lng === null);

  if (shouldGeocode) {
    const geo = await geocodeIfNeeded(req, patch.address);
    if (geo) {
      patch.lat = geo.lat;
      patch.lng = geo.lng;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, site: null });
  }

  const { data: site, error } = await supabase
    .from("sites")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, site });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin(req);

  const { data: site, error } = await supabase.from("sites").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, site });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUpdate(req, id);
}

// Frontend uses PUT in нескольких местах (сохранение карточки + быстрая смена категории)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUpdate(req, id);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin(req);

  // Вариант 3: «отвязать» jobs и assignments от объекта, чтобы FK не блокировал удаление
  const { error: jobsErr } = await supabase.from("jobs").update({ site_id: null }).eq("site_id", id);
  if (jobsErr) return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 });

  const { error: asgErr } = await supabase.from("assignments").delete().eq("site_id", id);
  if (asgErr) return NextResponse.json({ ok: false, error: asgErr.message }, { status: 500 });

  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
