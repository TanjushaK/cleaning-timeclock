import { NextRequest, NextResponse } from "next/server";
import { AdminApiErrorCode } from "@/lib/api-error-codes";
import { fillMissingLocalesFromRu } from "@/lib/deepl-fill.server";
import { parseLang, type Lang } from "@/lib/i18n-config";
import { parseI18nJson, resolveI18nField, ruSourceText, setI18nLocale } from "@/lib/localized-records";
import { requestLocale } from "@/lib/request-lang";
import { routeDynamicId } from "@/lib/server/route-dynamic-id";
import { ApiError, requireAdmin, toErrorResponse } from "@/lib/route-db";

type NotesKey = "notes" | "extra_note" | "note" | null;
type AvatarKey = "avatar_path" | "avatar_url" | "photo_path" | null;

let NOTES_KEY: NotesKey = null;
let AVATAR_KEY: AvatarKey = null;

async function resolveNotesKey(db: { from: (t: string) => unknown }): Promise<NotesKey> {
  if (NOTES_KEY) return NOTES_KEY;
  const candidates: NotesKey[] = ["notes", "extra_note", "note"];
  for (const k of candidates) {
    if (!k) continue;
    const { error } = await (db.from("profiles") as any).select(k).limit(1);
    if (!error) {
      NOTES_KEY = k;
      return k;
    }
    const msg = String((error as { message?: string })?.message || "");
    if (msg.includes("column") && msg.includes("does not exist")) continue;
  }
  NOTES_KEY = "notes";
  return NOTES_KEY;
}

async function resolveAvatarKey(db: { from: (t: string) => unknown }): Promise<AvatarKey> {
  if (AVATAR_KEY) return AVATAR_KEY;
  const candidates: AvatarKey[] = ["avatar_path", "avatar_url", "photo_path"];
  for (const k of candidates) {
    if (!k) continue;
    const { error } = await (db.from("profiles") as any).select(k).limit(1);
    if (!error) {
      AVATAR_KEY = k;
      return k;
    }
    const msg = String((error as { message?: string })?.message || "");
    if (msg.includes("column") && msg.includes("does not exist")) continue;
  }
  AVATAR_KEY = "avatar_path";
  return AVATAR_KEY;
}

function pick(obj: Record<string, unknown>, key: string): unknown {
  return obj?.[key];
}

function normMaybeString(v: unknown): string | null {
  if (v === null) return null;
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normTextField(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function shapeWorker(
  prof: Record<string, unknown>,
  notesKey: NotesKey,
  avatarKey: AvatarKey,
  loc: ReturnType<typeof requestLocale>,
) {
  const fullNameI18n = parseI18nJson(prof.full_name_i18n);
  const notesI18n = parseI18nJson(prof.notes_i18n);
  const legacyNotes = notesKey ? pick(prof, notesKey) : null;

  const out: Record<string, unknown> = {
    id: prof.id,
    full_name: resolveI18nField(fullNameI18n, loc, prof.full_name as string | null | undefined),
    role: prof.role ?? null,
    active: prof.active ?? null,
    email: prof.email ?? null,
    phone: prof.phone ?? null,
    notes: notesKey ? resolveI18nField(notesI18n, loc, legacyNotes as string | null | undefined) : null,
    avatar_path: avatarKey ? pick(prof, avatarKey) ?? null : null,
    full_name_i18n: fullNameI18n,
    notes_i18n: notesI18n,
  };
  return out;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    const db = (guard as { db: any }).db;
    const loc = requestLocale(req);

    const workerId = await routeDynamicId(req, ctx);
    if (!workerId) throw new ApiError(400, "Worker id required", AdminApiErrorCode.WORKER_ID_REQUIRED);

    const notesKey = await resolveNotesKey(db);
    const avatarKey = await resolveAvatarKey(db);

    const selectCols = ["id", "full_name", "role", "active", "phone", "email", "full_name_i18n", "notes_i18n"];
    if (notesKey) selectCols.push(notesKey);
    if (avatarKey) selectCols.push(avatarKey);

    const { data: prof, error: profErr } = await db
      .from("profiles")
      .select(selectCols.join(","))
      .eq("id", workerId)
      .maybeSingle();

    if (profErr) throw new ApiError(500, profErr.message || "Load failed", AdminApiErrorCode.PROFILE_LOAD_FAILED);
    if (!prof) throw new ApiError(404, "Profile not found", AdminApiErrorCode.PROFILE_NOT_FOUND);

    let authEmail: string | null = null;
    let authPhone: string | null = null;
    try {
      const { data: u } = await db.auth.admin.getUserById(workerId);
      authEmail = u?.user?.email ?? null;
      authPhone = (u?.user as { phone?: string | null })?.phone ?? null;
    } catch {
      // ignore
    }

    const row = prof as Record<string, unknown>;
    row.email = row.email ?? authEmail;
    row.phone = row.phone ?? authPhone;

    return NextResponse.json({ worker: shapeWorker(row, notesKey, avatarKey, loc) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    const db = (guard as { db: any }).db;
    const loc = requestLocale(req);

    const workerId = await routeDynamicId(req, ctx);
    if (!workerId) throw new ApiError(400, "Worker id required", AdminApiErrorCode.WORKER_ID_REQUIRED);

    const body = await req.json().catch(() => ({}));

    const notesKey = await resolveNotesKey(db);
    const avatarKey = await resolveAvatarKey(db);

    if (body?.fillMissingTranslations === true) {
      const apiKey = process.env.DEEPL_API_KEY?.trim();
      if (!apiKey) throw new ApiError(503, "DeepL not configured", AdminApiErrorCode.DEEPL_NOT_CONFIGURED);

      const selectCols = ["id", "full_name", "full_name_i18n", "notes_i18n"];
      if (notesKey) selectCols.push(notesKey);

      const { data: prof, error: profErr } = await db
        .from("profiles")
        .select(selectCols.join(","))
        .eq("id", workerId)
        .maybeSingle();

      if (profErr) throw new ApiError(500, profErr.message || "Load failed", AdminApiErrorCode.PROFILE_LOAD_FAILED);
      if (!prof) throw new ApiError(404, "Profile not found", AdminApiErrorCode.PROFILE_NOT_FOUND);

      const row = prof as Record<string, unknown>;
      let fnI = parseI18nJson(row.full_name_i18n);
      let nI = parseI18nJson(row.notes_i18n);
      const ruFn = ruSourceText(fnI, row.full_name as string | null);
      const legacyNotes = notesKey ? pick(row, notesKey) : null;
      const ruNotes = ruSourceText(nI, legacyNotes as string | null);

      try {
        fnI = await fillMissingLocalesFromRu(ruFn, fnI, ["en", "uk", "nl"]);
        if (ruNotes) nI = await fillMissingLocalesFromRu(ruNotes, nI, ["en", "uk", "nl"]);
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "DEEPL_NOT_CONFIGURED") {
          throw new ApiError(503, "DeepL not configured", AdminApiErrorCode.DEEPL_NOT_CONFIGURED);
        }
        throw e;
      }

      const patch: Record<string, unknown> = { full_name_i18n: fnI, notes_i18n: nI };

      const { error: updErr } = await db.from("profiles").update(patch).eq("id", workerId);
      if (updErr) throw new ApiError(500, updErr.message || "Update failed", AdminApiErrorCode.PROFILE_UPDATE_FAILED);

      const avatarKey2 = await resolveAvatarKey(db);
      const selectCols2 = ["id", "full_name", "role", "active", "phone", "email", "full_name_i18n", "notes_i18n"];
      if (notesKey) selectCols2.push(notesKey);
      if (avatarKey2) selectCols2.push(avatarKey2);

      const { data: prof2, error: p2e } = await db
        .from("profiles")
        .select(selectCols2.join(","))
        .eq("id", workerId)
        .maybeSingle();

      if (p2e) throw new ApiError(500, p2e.message || "Load failed", AdminApiErrorCode.PROFILE_LOAD_FAILED);

      let authEmail: string | null = null;
      let authPhone: string | null = null;
      try {
        const { data: u } = await db.auth.admin.getUserById(workerId);
        authEmail = u?.user?.email ?? null;
        authPhone = (u?.user as { phone?: string | null })?.phone ?? null;
      } catch {
        // ignore
      }

      const row2 = (prof2 || {}) as Record<string, unknown>;
      row2.email = row2.email ?? authEmail;
      row2.phone = row2.phone ?? authPhone;

      return NextResponse.json({ worker: shapeWorker(row2, notesKey, avatarKey2, loc) });
    }

    const editLocale: Lang = parseLang(body?.editLocale) ?? "ru";

    const { data: existing, error: exErr } = await db
      .from("profiles")
      .select(["id", "full_name", "full_name_i18n", "notes_i18n", notesKey, avatarKey].filter(Boolean).join(","))
      .eq("id", workerId)
      .maybeSingle();

    if (exErr) throw new ApiError(500, exErr.message || "Load failed", AdminApiErrorCode.PROFILE_LOAD_FAILED);
    if (!existing) throw new ApiError(404, "Profile not found", AdminApiErrorCode.PROFILE_NOT_FOUND);

    const ex = existing as Record<string, unknown>;
    let fnI = parseI18nJson(ex.full_name_i18n);
    let nI = parseI18nJson(ex.notes_i18n);

    const profilePatch: Record<string, unknown> = {};
    const authPatch: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
      const v = normTextField(body.full_name);
      fnI = setI18nLocale(fnI, editLocale, v);
      profilePatch.full_name_i18n = fnI;
      if (editLocale === "ru") {
        profilePatch.full_name = v;
      }
    }

    if (notesKey && Object.prototype.hasOwnProperty.call(body, "notes")) {
      const v = normTextField(body.notes);
      nI = setI18nLocale(nI, editLocale, v);
      profilePatch.notes_i18n = nI;
      if (editLocale === "ru") {
        profilePatch[notesKey] = v == null ? null : String(body.notes ?? "");
      }
    }

    if (avatarKey && Object.prototype.hasOwnProperty.call(body, "avatar_path")) {
      profilePatch[avatarKey] = body.avatar_path == null ? null : String(body.avatar_path);
    }

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const phone = normMaybeString(body.phone);
      profilePatch.phone = phone;
      authPatch.phone = phone;
      if (phone) authPatch.phone_confirm = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const email = normMaybeString(body.email);
      profilePatch.email = email;
      authPatch.email = email;
      if (email) authPatch.email_confirm = true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "password")) {
      const pw = String(body.password ?? "").trim();
      if (pw) authPatch.password = pw;
    }

    if (Object.keys(profilePatch).length === 0 && Object.keys(authPatch).length === 0) {
      throw new ApiError(400, "Nothing to update", AdminApiErrorCode.NOTHING_TO_UPDATE);
    }

    if (Object.keys(authPatch).length > 0) {
      try {
        const { error: uErr } = await db.auth.admin.updateUserById(workerId, authPatch);
        if (uErr) throw new ApiError(400, uErr.message || "Auth update failed", AdminApiErrorCode.AUTH_USER_UPDATE_FAILED);
      } catch (e: unknown) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(400, String((e as Error)?.message || "Auth update failed"), AdminApiErrorCode.AUTH_USER_UPDATE_FAILED);
      }
    }

    if (Object.keys(profilePatch).length > 0) {
      const { error: updErr } = await db.from("profiles").update(profilePatch).eq("id", workerId);
      if (updErr) throw new ApiError(500, updErr.message || "Update failed", AdminApiErrorCode.PROFILE_UPDATE_FAILED);
    }

    const selectCols = ["id", "full_name", "role", "active", "phone", "email", "full_name_i18n", "notes_i18n"];
    if (notesKey) selectCols.push(notesKey);
    if (avatarKey) selectCols.push(avatarKey);

    const { data: prof2, error: p2e } = await db
      .from("profiles")
      .select(selectCols.filter(Boolean).join(","))
      .eq("id", workerId)
      .maybeSingle();

    if (p2e) throw new ApiError(500, p2e.message || "Load failed", AdminApiErrorCode.PROFILE_LOAD_FAILED);

    let authEmail: string | null = null;
    let authPhone: string | null = null;
    try {
      const { data: u } = await db.auth.admin.getUserById(workerId);
      authEmail = u?.user?.email ?? null;
      authPhone = (u?.user as { phone?: string | null })?.phone ?? null;
    } catch {
      // ignore
    }

    const row = (prof2 || {}) as Record<string, unknown>;
    row.email = row.email ?? authEmail;
    row.phone = row.phone ?? authPhone;

    return NextResponse.json({ worker: shapeWorker(row, notesKey, avatarKey, loc) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
