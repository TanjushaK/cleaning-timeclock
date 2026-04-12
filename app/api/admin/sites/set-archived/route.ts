// app/api/admin/sites/set-archived/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { adminJsonError } from "@/lib/admin-api-message";

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

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

async function assertAdmin(req: NextRequest) {
  const token = bearer(req);
  if (!token) return adminJsonError(401, AdminApiErrorCode.AUTH_BEARER_REQUIRED, "Bearer token required");

  const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const anon = envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user)
    return adminJsonError(401, AdminApiErrorCode.AUTH_TOKEN_INVALID, "Invalid token");

  const { data: prof, error: profErr } = await sb.from("profiles").select("id, role, active").eq("id", userData.user.id).single();

  if (profErr || !prof) return adminJsonError(403, AdminApiErrorCode.AUTH_PROFILE_MISSING, "Profile not found");
  if (prof.role !== "admin" || prof.active !== true)
    return adminJsonError(403, AdminApiErrorCode.AUTH_ADMIN_REQUIRED, "Admin required");

  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req);
    if (!("ok" in guard) || !guard.ok) return guard as NextResponse;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const siteId = String(body?.site_id || "").trim();
    const archived = Boolean(body?.archived);

    if (!siteId) return adminJsonError(400, AdminApiErrorCode.SITE_ID_REQUIRED, "site_id is required");

    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (archived) {
      await admin.from("assignments").delete().eq("site_id", siteId);
    }

    const patch = archived ? { archived_at: new Date().toISOString() } : { archived_at: null };

    const { data, error } = await admin.from("sites").update(patch).eq("id", siteId).select("id, name, lat, lng, radius, archived_at").single();

    if (error) return adminJsonError(500, AdminApiErrorCode.DB_ERROR, error.message);

    return NextResponse.json({ ok: true, site: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { errorCode: AdminApiErrorCode.UNEXPECTED_ERROR, error: String((e as Error)?.message || "Server error") },
      { status: 500 },
    );
  }
}
