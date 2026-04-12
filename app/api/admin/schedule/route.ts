import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminBearer } from "@/lib/admin-bearer-guard";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { jsonApiError } from "@/lib/json-api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdminBearer(req);
    if (!guard.ok) return guard.response;

    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const sp = req.nextUrl.searchParams;

    const rawFrom = (sp.get("date_from") || sp.get("from") || "").trim();
    const rawTo = (sp.get("date_to") || sp.get("to") || "").trim();

    if (!rawFrom || !rawTo)
      return jsonApiError(400, ApiErrorCodes.SCHEDULE_RANGE_REQUIRED, "from and to are required");

    if (!isISODate(rawFrom) || !isISODate(rawTo))
      return jsonApiError(400, ApiErrorCodes.SCHEDULE_RANGE_INVALID, "Invalid date range");

    const dateFrom = rawFrom;
    const dateTo = rawTo;

    const siteId = (sp.get("site_id") || "").trim();
    const workerId = (sp.get("worker_id") || "").trim();

    const baseSelect = "id,status,job_date,scheduled_time,site_id,worker_id";

    let q = admin
      .from("jobs")
      .select(`${baseSelect},scheduled_end_time`)
      .gte("job_date", dateFrom)
      .lte("job_date", dateTo);

    if (siteId) q = q.eq("site_id", siteId);
    if (workerId) q = q.eq("worker_id", workerId);

    let jobs: any[] | null = null;
    let jobsErr: any = null;

    ({ data: jobs, error: jobsErr } = await q);

    if (jobsErr && String(jobsErr?.message || "").toLowerCase().includes("scheduled_end_time")) {
      let q2 = admin
        .from("jobs")
        .select(baseSelect)
        .gte("job_date", dateFrom)
        .lte("job_date", dateTo);

      if (siteId) q2 = q2.eq("site_id", siteId);
      if (workerId) q2 = q2.eq("worker_id", workerId);

      ({ data: jobs, error: jobsErr } = await q2);
    }

    if (jobsErr)
      return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, jobsErr.message || "Query failed");

    const jobIds = (jobs || []).map((j: any) => j.id);
    const siteIds = Array.from(new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean)));
    const workerIds = Array.from(new Set((jobs || []).map((j: any) => j.worker_id).filter(Boolean)));

    const [sitesRes, workersRes, logsRes] = await Promise.all([
      siteIds.length
        ? admin.from("sites").select("id,name").in("id", siteIds)
        : Promise.resolve({ data: [], error: null } as any),
      workerIds.length
        ? admin.from("profiles").select("id,full_name").in("id", workerIds)
        : Promise.resolve({ data: [], error: null } as any),
      jobIds.length
        ? admin.from("time_logs").select("job_id,started_at,stopped_at").in("job_id", jobIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    if (sitesRes.error)
      return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, sitesRes.error.message);
    if (workersRes.error)
      return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, workersRes.error.message);
    if (logsRes.error)
      return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, logsRes.error.message);

    const siteName = new Map<string, string>();
    for (const s of (sitesRes.data || []) as any[]) siteName.set(s.id, s.name || "");

    const workerName = new Map<string, string>();
    for (const w of (workersRes.data || []) as any[]) workerName.set(w.id, w.full_name || "");

    const logAgg = new Map<string, { started_at: string | null; stopped_at: string | null }>();
    for (const l of (logsRes.data || []) as any[]) {
      const id = String(l.job_id);
      const cur = logAgg.get(id) || { started_at: null, stopped_at: null };
      if (l.started_at) {
        if (!cur.started_at || String(l.started_at) < cur.started_at) cur.started_at = String(l.started_at);
      }
      if (l.stopped_at) {
        if (!cur.stopped_at || String(l.stopped_at) > cur.stopped_at) cur.stopped_at = String(l.stopped_at);
      }
      logAgg.set(id, cur);
    }

    const items = (jobs || []).map((j: any) => {
      const agg = logAgg.get(String(j.id)) || { started_at: null, stopped_at: null };
      return {
        id: String(j.id),
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        scheduled_end_time: (j as any).scheduled_end_time ?? null,
        site_id: j.site_id,
        site_name: j.site_id ? siteName.get(String(j.site_id)) || null : null,
        worker_id: j.worker_id,
        worker_name: j.worker_id ? workerName.get(String(j.worker_id)) || null : null,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return jsonApiError(500, ApiErrorCodes.ADMIN_INTERNAL, String(e?.message || e || "Server error"));
  }
}
