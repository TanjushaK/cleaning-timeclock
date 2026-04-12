import { NextResponse } from "next/server";
import { AppApiErrorCodes } from "@/lib/app-error-codes";
import { ApiError, requireActiveWorker, toErrorResponse } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireActiveWorker(req);
    const body = await req.json();

    const site_id = String(body?.site_id || "");
    const extra_note = body?.extra_note == null ? "" : String(body.extra_note);

    if (!site_id) throw new ApiError(400, "site_id required", AppApiErrorCodes.ASSIGNMENT_SITE_ID_REQUIRED);

    const { data: row, error: rErr } = await supabase
      .from("assignments")
      .select("site_id, worker_id")
      .eq("site_id", site_id)
      .eq("worker_id", userId)
      .maybeSingle();

    if (rErr) throw new ApiError(500, rErr.message, AppApiErrorCodes.ASSIGNMENT_READ_FAILED);
    if (!row) throw new ApiError(403, "No assignment for site", AppApiErrorCodes.ASSIGNMENT_FOR_SITE_NOT_FOUND);

    const { error: uErr } = await supabase
      .from("assignments")
      .update({ extra_note, updated_at: new Date().toISOString() })
      .eq("site_id", site_id)
      .eq("worker_id", userId);

    if (uErr) throw new ApiError(500, uErr.message, AppApiErrorCodes.ASSIGNMENT_NOTE_SAVE_FAILED);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    return toErrorResponse(e);
  }
}
