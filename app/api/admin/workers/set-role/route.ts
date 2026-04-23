import { NextRequest, NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/route-db";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const workerId = String(body?.worker_id || "").trim();
    const role = String(body?.role || "").trim();

    if (!workerId) throw new ApiError(400, "worker_id is required", AdminApiErrorCode.WORKER_ID_REQUIRED);
    if (role !== "admin" && role !== "worker") {
      throw new ApiError(400, 'role must be "admin" or "worker"', AdminApiErrorCode.ROLE_MUST_BE_ADMIN_OR_WORKER);
    }

    if (workerId === guard.userId && role !== "admin") {
      throw new ApiError(400, "Cannot demote yourself", AdminApiErrorCode.WORKER_SELF_DEMOTE);
    }

    const patch: Record<string, unknown> = { role };
    if (role === "admin") patch.active = true;

    const { error } = await guard.db.from("profiles").update(patch).eq("id", workerId);
    if (error) throw new ApiError(500, error.message || "Update failed", AdminApiErrorCode.DB_ERROR);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
