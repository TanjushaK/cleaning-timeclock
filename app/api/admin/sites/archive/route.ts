import { NextResponse } from "next/server";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { ApiError, requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toErr(e: any) {
  if (e instanceof ApiError && e.errorCode) {
    return { status: e.status, error: e.message, errorCode: e.errorCode };
  }
  const msg = String(e?.message || e || "");
  if (msg === "UNAUTHORIZED")
    return { status: 401, error: "Sign in required", errorCode: ApiErrorCodes.ADMIN_SIGN_IN_REQUIRED };
  if (msg === "FORBIDDEN")
    return { status: 403, error: "Access denied", errorCode: ApiErrorCodes.ADMIN_NOT_ADMIN };
  return { status: 500, error: msg || "Server error", errorCode: ApiErrorCodes.ADMIN_INTERNAL };
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({} as any));
    const siteId = String(body?.site_id || "").trim();
    const archived = Boolean(body?.archived);

    if (!siteId) {
      return NextResponse.json(
        { error: "site_id is required", errorCode: ApiErrorCodes.SITE_ID_REQUIRED },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("sites").update({ archived }).eq("id", siteId);

    if (error) {
      throw new Error(`Could not update site: ${error.message}`);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const r = toErr(e);
    return NextResponse.json({ error: r.error, errorCode: r.errorCode }, { status: r.status });
  }
}
