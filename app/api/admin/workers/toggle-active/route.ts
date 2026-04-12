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
    const workerId = String(body?.worker_id || "").trim();
    const active = Boolean(body?.active);

    if (!workerId) {
      throw new ApiError(400, "worker_id is required", AdminApiErrorCode.WORKER_ID_REQUIRED);
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("profiles").update({ active }).eq("id", workerId);

    if (error) {
      throw new ApiError(500, error.message || "Update failed", AdminApiErrorCode.PROFILE_UPDATE_FAILED);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
