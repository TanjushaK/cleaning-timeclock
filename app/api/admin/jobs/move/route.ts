import { NextResponse } from "next/server";
import { requireAdmin, ApiError, toErrorResponse } from "@/lib/supabase-server";

function jsonError(status: number, message: string, details?: any) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

function pickStr(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Move a job (shift) to another date/time/site.
 * IMPORTANT: do NOT touch jobs.status (to avoid jobs_status_check surprises).
 *
 * Body supports:
 *  - job_id | jobId | id
 *  - to_date | toDate | job_date | date  (YYYY-MM-DD)
 *  - to_time | toTime | scheduled_time | time (HH:MM)
 *  - to_site_id | toSiteId | site_id
 */
export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req);

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const jobId =
      pickStr(body?.job_id) ??
      pickStr(body?.jobId) ??
      pickStr(body?.id) ??
      pickStr(body?.job?.id);

    if (!jobId) return jsonError(400, "Missing job_id");

    const toDate =
      pickStr(body?.to_date) ??
      pickStr(body?.toDate) ??
      pickStr(body?.job_date) ??
      pickStr(body?.date);

    const toTime =
      pickStr(body?.to_time) ??
      pickStr(body?.toTime) ??
      pickStr(body?.scheduled_time) ??
      pickStr(body?.time);

    const toSiteId =
      pickStr(body?.to_site_id) ??
      pickStr(body?.toSiteId) ??
      pickStr(body?.site_id);

    if (!toDate && !toTime && !toSiteId) {
      return jsonError(400, "Nothing to move: provide to_date and/or to_time and/or to_site_id");
    }

    // Load current job (optional rules)
    const curRes = await guard.supabase
      .from("jobs")
      .select("id,status,job_date,scheduled_time,site_id")
      .eq("id", jobId)
      .maybeSingle();

    if (curRes.error) return jsonError(500, "Failed to load job", curRes.error);
    if (!curRes.data) return jsonError(404, "Job not found");

    // Business rule: do not allow moving jobs that are already started/done.
    // If you want to allow moving in_progress jobs, remove this block.
    if (curRes.data.status === "in_progress" || curRes.data.status === "done") {
      return jsonError(409, "Cannot move job that is in progress or done");
    }

    const patch: any = {};
    if (toDate) patch.job_date = toDate;
    if (toTime) patch.scheduled_time = toTime;
    if (toSiteId) patch.site_id = toSiteId;

    const updRes = await guard.supabase
      .from("jobs")
      .update(patch)
      .eq("id", jobId)
      .select("id,status,job_date,scheduled_time,site_id")
      .maybeSingle();

    if (updRes.error) return jsonError(500, "Failed to move job", updRes.error);
    if (!updRes.data) return jsonError(404, "Job not found");

    return NextResponse.json({ ok: true, job: updRes.data });
  } catch (e: any) {
    if (e instanceof ApiError) return toErrorResponse(e);
    return jsonError(500, "Internal Server Error", { message: String(e?.message ?? e) });
  }
}
