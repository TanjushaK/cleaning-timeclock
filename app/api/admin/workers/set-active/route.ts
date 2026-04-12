// app/api/admin/workers/set-active/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const workerId = String(body?.worker_id || "").trim();
    const active = Boolean(body?.active);

    if (!workerId) throw new ApiError(400, "worker_id is required", AdminApiErrorCode.WORKER_ID_REQUIRED);

    const { data: prof, error: profErr } = await guard.supabase
      .from("profiles")
      .select("id, role")
      .eq("id", workerId)
      .single();

    if (profErr || !prof) throw new ApiError(404, "Profile not found", AdminApiErrorCode.PROFILE_NOT_FOUND);
    if (prof.role === "admin") {
      throw new ApiError(409, "Cannot disable an admin", AdminApiErrorCode.WORKER_ADMIN_DISABLE_FORBIDDEN);
    }

    const { error: updErr } = await guard.supabase.from("profiles").update({ active }).eq("id", workerId);
    if (updErr) throw new ApiError(500, updErr.message || "Update failed", AdminApiErrorCode.DB_ERROR);

    if (!active) {
      await guard.supabase.from("assignments").delete().eq("worker_id", workerId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
