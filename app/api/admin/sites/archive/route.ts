import { NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const siteId = String(body?.site_id || "").trim();
    const archived = Boolean(body?.archived);

    if (!siteId) {
      throw new ApiError(400, "site_id is required", AdminApiErrorCode.SITE_ID_REQUIRED);
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("sites").update({ archived }).eq("id", siteId);

    if (error) {
      throw new ApiError(500, error.message || "Update failed", AdminApiErrorCode.SITE_UPDATE_FAILED);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
