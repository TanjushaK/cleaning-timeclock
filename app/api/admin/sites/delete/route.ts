// app/api/admin/sites/delete/route.ts
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
    const siteId = String(body?.site_id || "").trim();
    if (!siteId) return jsonApiError(400, ApiErrorCodes.SITE_ID_REQUIRED, "site_id is required");

    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: jobsHit, error: jobsErr } = await admin.from("jobs").select("id").eq("site_id", siteId).limit(1);

    if (jobsErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, jobsErr.message);
    if (jobsHit && jobsHit.length > 0) {
      return jsonApiError(409, ApiErrorCodes.SITE_DELETE_HAS_JOBS, "Cannot delete site (shifts exist)");
    }

    await admin.from("assignments").delete().eq("site_id", siteId);

    const { error: delErr } = await admin.from("sites").delete().eq("id", siteId);
    if (delErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, delErr.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonApiError(500, ApiErrorCodes.ADMIN_INTERNAL, String(e?.message || e || "Server error"));
  }
}
