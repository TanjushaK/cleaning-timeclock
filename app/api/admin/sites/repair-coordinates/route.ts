import { NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { geocodeAddressViaNominatim, siteHasCoordinates } from "@/lib/server/admin-geocode";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/route-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};

export async function POST(req: Request) {
  try {
    const { db } = await requireAdmin(req.headers);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const ids = Array.isArray(body?.siteIds)
      ? body.siteIds
          .map((x: unknown) => String(x ?? "").trim())
          .filter((id: string): boolean => id.length > 0)
      : [];
    const limitRaw = Number(body?.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

    let rows: SiteRow[] = [];
    if (ids.length > 0) {
      const { data, error } = await db
        .from("sites")
        .select("id,address,lat,lng,radius")
        .in("id", ids);
      if (error) throw new ApiError(500, error.message || "Sites load failed", AdminApiErrorCode.SITES_LOAD_FAILED);
      rows = (data || []) as SiteRow[];
    } else {
      const { data, error } = await db
        .from("sites")
        .select("id,address,lat,lng,radius")
        .is("archived_at", null)
        .limit(limit);
      if (error) throw new ApiError(500, error.message || "Sites load failed", AdminApiErrorCode.SITES_LOAD_FAILED);
      rows = (data || []) as SiteRow[];
    }

    const candidates = rows.filter((s) => !siteHasCoordinates(s.lat, s.lng, s.radius) && String(s.address || "").trim());
    const repaired: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const site of candidates) {
      const address = String(site.address || "").trim();
      const geo = await geocodeAddressViaNominatim(address);
      if (!geo) {
        failed.push({ id: site.id, reason: "GEOCODE_NO_RESULTS" });
        continue;
      }
      const { error: updErr } = await db
        .from("sites")
        .update({ lat: geo.lat, lng: geo.lng })
        .eq("id", site.id);
      if (updErr) {
        failed.push({ id: site.id, reason: updErr.message || "SITE_UPDATE_FAILED" });
        continue;
      }
      repaired.push(site.id);
    }

    return NextResponse.json(
      {
        ok: true,
        scanned: rows.length,
        attempted: candidates.length,
        repaired,
        failed,
      },
      { status: 200 },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
