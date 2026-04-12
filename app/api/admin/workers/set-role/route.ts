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
    const role = String(body?.role || "").trim();

    if (!workerId) return jsonApiError(400, ApiErrorCodes.WORKER_ID_REQUIRED, "worker_id is required");
    if (role !== "admin" && role !== "worker")
      return jsonApiError(400, ApiErrorCodes.ROLE_MUST_BE_ADMIN_OR_WORKER, 'role must be "admin" or "worker"');

    if (workerId === guard.adminId && role !== "admin")
      return jsonApiError(400, ApiErrorCodes.CANT_DEMOTE_SELF, "You cannot demote yourself");

    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const patch: Record<string, any> = { role };
    if (role === "admin") patch.active = true;

    const { error } = await admin.from("profiles").update(patch).eq("id", workerId);
    if (error) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, error.message);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonApiError(500, ApiErrorCodes.ADMIN_INTERNAL, String(e?.message || e || "Server error"));
  }
}
