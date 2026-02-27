import { NextResponse } from "next/server";
import { requireAdmin, ApiError, toErrorResponse } from "@/lib/supabase-server";

function jsonError(status: number, message: string, details?: any) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

function pickStr(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Move ALL jobs from one day to another.
 * IMPORTANT: do NOT touch jobs.status (to avoid jobs_status_check surprises).
 *
 * Body supports:
 *  - from_date | fromDate (YYYY-MM-DD)
 *  - to_date   | toDate   (YYYY-MM-DD)
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

    const fromDate = pickStr(body?.from_date) ?? pickStr(body?.fromDate);
    const toDate = pickStr(body?.to_date) ?? pickStr(body?.toDate);

    if (!fromDate || !toDate) return jsonError(400, "Missing from_date or to_date");
    if (fromDate === toDate) return jsonError(400, "from_date equals to_date");

    // Only move planned jobs; keep started/done where they are.
    const updRes = await guard.supabase
      .from("jobs")
      .update({ job_date: toDate })
      .eq("job_date", fromDate)
      .eq("status", "planned")
      .select("id");

    if (updRes.error) return jsonError(500, "Failed to move-day", updRes.error);

    return NextResponse.json({ ok: true, moved_count: updRes.data?.length ?? 0 });
  } catch (e: any) {
    if (e instanceof ApiError) return toErrorResponse(e);
    return jsonError(500, "Internal Server Error", { message: String(e?.message ?? e) });
  }
}
