import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toStringSafe(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNumberSafe(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function geocodeAddress(req: NextRequest, address: string) {
  const url = new URL("/api/geocode", req.nextUrl.origin);
  url.searchParams.set("q", address);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.ok) return null;

    const lat = toNumberSafe(data.lat);
    const lng = toNumberSafe(data.lng);

    if (lat === null || lng === null) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

async function updateSite(req: NextRequest, id: string) {
  const { supabase } = await requireAdmin(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const patch: Record<string, any> = {};

  if ("name" in body) {
    patch.name = toStringSafe(body.name);
  }

  let addressChanged = false;

  if ("address" in body) {
    patch.address = toStringSafe(body.address);
    addressChanged = patch.address.length > 0;
  }

  if ("radius" in body) {
    patch.radius = toNumberSafe(body.radius);
  }

  if ("notes" in body) {
    patch.notes = body.notes === null ? null : toStringSafe(body.notes);
  }

  if ("category" in body || "categoryId" in body) {
    const raw = body.category ?? body.categoryId;
    patch.category = toNumberSafe(raw);
  }

  if ("lat" in body) {
    patch.lat = toNumberSafe(body.lat);
  }

  if ("lng" in body) {
    patch.lng = toNumberSafe(body.lng);
  }

  // Если адрес изменился и координаты явно не передали — пробуем геокодить
  if (addressChanged && (patch.lat === undefined || patch.lng === undefined)) {
    const geo = await geocodeAddress(req, patch.address);
    if (geo) {
      patch.lat = geo.lat;
      patch.lng = geo.lng;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { data, error } = await supabase
    .from("sites")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, site: data });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await requireAdmin(req);

  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, site: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return updateSite(req, id);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return updateSite(req, id);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await requireAdmin(req);

  const { error: jobsErr } = await supabase
    .from("jobs")
    .update({ site_id: null })
    .eq("site_id", id);

  if (jobsErr) {
    return NextResponse.json({ ok: false, error: jobsErr.message }, { status: 500 });
  }

  const { error: asgErr } = await supabase
    .from("assignments")
    .delete()
    .eq("site_id", id);

  if (asgErr) {
    return NextResponse.json({ ok: false, error: asgErr.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("sites")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
