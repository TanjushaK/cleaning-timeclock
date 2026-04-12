// app/api/admin/workers/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminBearer } from "@/lib/admin-bearer-guard";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { jsonApiError } from "@/lib/json-api-error";

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? "")
    .replace(/\uFEFF/g, "")
    .trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function envOrThrow(name: string) {
  const v = cleanEnv(process.env[name]);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdminBearer(req);
    if (!guard.ok) return guard.response;

    const body = await req.json().catch(() => ({} as any));
    const workerId = String(body?.worker_id || "").trim();
    if (!workerId) return jsonApiError(400, ApiErrorCodes.WORKER_ID_REQUIRED, "worker_id is required");

    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: prof, error: profErr } = await admin.from("profiles").select("id, role").eq("id", workerId).single();

    if (profErr || !prof) return jsonApiError(404, ApiErrorCodes.PROFILE_NOT_FOUND, "Profile not found");
    if (prof.role === "admin") return jsonApiError(409, ApiErrorCodes.CANT_DELETE_ADMIN, "Cannot delete an admin");

    const { data: logsHit, error: logsErr } = await admin.from("time_logs").select("id").eq("worker_id", workerId).limit(1);

    if (logsErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, logsErr.message);
    if (logsHit && logsHit.length > 0) {
      return jsonApiError(409, ApiErrorCodes.WORKER_DELETE_HAS_TIMELOGS, "Cannot delete worker (time logs exist)");
    }

    const { data: jobsHit, error: jobsErr } = await admin.from("jobs").select("id").eq("worker_id", workerId).limit(1);

    if (jobsErr) {
      // schema may lack worker_id — ignore
    } else if (jobsHit && jobsHit.length > 0) {
      return jsonApiError(409, ApiErrorCodes.WORKER_DELETE_HAS_JOBS, "Cannot delete worker (shifts exist)");
    }

    await admin.from("assignments").delete().eq("worker_id", workerId);

    const { error: profDelErr } = await admin.from("profiles").delete().eq("id", workerId);
    if (profDelErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, profDelErr.message);

    const { error: authDelErr } = await admin.auth.admin.deleteUser(workerId);
    if (authDelErr) {
      return NextResponse.json(
        {
          error: `Profile deleted but auth user not removed: ${authDelErr.message}`,
          errorCode: ApiErrorCodes.ADMIN_AUTH_USER_REMAINS,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonApiError(500, ApiErrorCodes.ADMIN_INTERNAL, String(e?.message || e || "Server error"));
  }
}
