// app/api/admin/workers/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const workerId = String(body?.worker_id || "").trim();
    if (!workerId) throw new ApiError(400, "worker_id is required", AdminApiErrorCode.WORKER_ID_REQUIRED);

    const admin = guard.supabase;

    const { data: prof, error: profErr } = await admin.from("profiles").select("id, role").eq("id", workerId).single();

    if (profErr || !prof) throw new ApiError(404, "Profile not found", AdminApiErrorCode.PROFILE_NOT_FOUND);
    if (prof.role === "admin") {
      throw new ApiError(409, "Cannot delete an admin", AdminApiErrorCode.WORKER_DELETE_ADMIN_FORBIDDEN);
    }

    const { data: logsHit, error: logsErr } = await admin.from("time_logs").select("id").eq("worker_id", workerId).limit(1);

    if (logsErr) throw new ApiError(500, logsErr.message || "Query failed", AdminApiErrorCode.DB_ERROR);
    if (logsHit && logsHit.length > 0) {
      throw new ApiError(
        409,
        "Cannot delete worker: time logs exist. Disable or anonymize.",
        AdminApiErrorCode.WORKER_DELETE_HAS_LOGS,
      );
    }

    const { data: jobsHit, error: jobsErr } = await admin.from("jobs").select("id").eq("worker_id", workerId).limit(1);

    if (!jobsErr && jobsHit && jobsHit.length > 0) {
      throw new ApiError(
        409,
        "Cannot delete worker: jobs exist. Disable or anonymize.",
        AdminApiErrorCode.WORKER_DELETE_HAS_JOBS,
      );
    }

    await admin.from("assignments").delete().eq("worker_id", workerId);

    const { error: profDelErr } = await admin.from("profiles").delete().eq("id", workerId);
    if (profDelErr) throw new ApiError(500, profDelErr.message || "Delete failed", AdminApiErrorCode.DB_ERROR);

    const { error: authDelErr } = await admin.auth.admin.deleteUser(workerId);
    if (authDelErr) {
      return NextResponse.json(
        {
          ok: true,
          errorCode: AdminApiErrorCode.WORKER_DELETE_AUTH_INCOMPLETE,
          error: `Profile deleted but auth user was not removed: ${authDelErr.message}`,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
