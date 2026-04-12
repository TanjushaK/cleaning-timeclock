import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminBearer } from "@/lib/admin-bearer-guard";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { AppApiErrorCodes } from "@/lib/app-error-codes";
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

    const jobId = String(body?.job_id || "").trim();
    if (!jobId) return jsonApiError(400, AppApiErrorCodes.JOB_ID_REQUIRED, "job_id is required");

    const patch: Record<string, any> = {};

    if (body?.site_id != null) patch.site_id = String(body.site_id).trim() || null;
    if (body?.worker_id != null) patch.worker_id = String(body.worker_id).trim() || null;
    if (body?.job_date != null) patch.job_date = String(body.job_date).trim() || null;
    if (body?.scheduled_time != null) {
      const t = String(body.scheduled_time).trim();
      patch.scheduled_time = t ? (t.length === 5 ? `${t}:00` : t) : null;
    }
    if (body?.status != null) patch.status = String(body.status).trim() || null;

    if (Object.keys(patch).length === 0)
      return jsonApiError(400, ApiErrorCodes.NOTHING_TO_UPDATE, "Nothing to update");

    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: logs, error: logsErr } = await admin.from("time_logs").select("id").eq("job_id", jobId).limit(1);
    if (logsErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, logsErr.message);

    const hasLogs = Array.isArray(logs) && logs.length > 0;

    if (hasLogs) {
      if (patch.worker_id != null && patch.worker_id !== undefined) {
        return jsonApiError(400, ApiErrorCodes.JOB_UPDATE_HAS_TIMELOGS, "Cannot change worker (time entries exist)");
      }
      if (patch.site_id != null && patch.site_id !== undefined) {
        return jsonApiError(400, ApiErrorCodes.JOB_UPDATE_SITE_HAS_TIMELOGS, "Cannot change site (time entries exist)");
      }
      if (patch.job_date != null && patch.job_date !== undefined) {
        return jsonApiError(400, ApiErrorCodes.JOB_UPDATE_DATE_HAS_TIMELOGS, "Cannot change date (time entries exist)");
      }
      if (patch.scheduled_time != null && patch.scheduled_time !== undefined) {
        return jsonApiError(400, ApiErrorCodes.JOB_UPDATE_TIME_HAS_TIMELOGS, "Cannot change time (time entries exist)");
      }
    }

    const { error } = await admin.from("jobs").update(patch).eq("id", jobId);
    if (error) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonApiError(500, ApiErrorCodes.ADMIN_INTERNAL, String(e?.message || e || "Server error"));
  }
}
