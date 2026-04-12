import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApiErrorCodes } from "@/lib/api-error-codes";

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

export type AdminBearerResult =
  | { ok: true; adminId: string }
  | { ok: false; response: NextResponse };

/** Shared admin gate for routes that verify Bearer JWT + profiles.role=admin (inline Supabase anon client). */
export async function requireAdminBearer(req: NextRequest): Promise<AdminBearerResult> {
  const token = bearer(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Sign in required",
          errorCode: ApiErrorCodes.ADMIN_SIGN_IN_REQUIRED,
        },
        { status: 401 },
      ),
    };
  }

  const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const anon = envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid or expired token",
          errorCode: ApiErrorCodes.ADMIN_TOKEN_INVALID,
        },
        { status: 401 },
      ),
    };
  }

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("id, role, active")
    .eq("id", userData.user.id)
    .single();

  if (profErr || !prof) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Profile not found",
          errorCode: ApiErrorCodes.ADMIN_PROFILE_NOT_FOUND,
        },
        { status: 403 },
      ),
    };
  }

  if (prof.role !== "admin" || prof.active !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Admin role required",
          errorCode: ApiErrorCodes.ADMIN_NOT_ADMIN,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, adminId: userData.user.id };
}
