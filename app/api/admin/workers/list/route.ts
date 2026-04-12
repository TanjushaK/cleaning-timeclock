import { NextRequest, NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, active")
      .order("full_name", { ascending: true });

    if (error) throw new ApiError(500, error.message || "Load failed", AdminApiErrorCode.DB_ERROR);
    return NextResponse.json({ workers: data ?? [] });
  } catch (e) {
    return toErrorResponse(e);
  }
}
