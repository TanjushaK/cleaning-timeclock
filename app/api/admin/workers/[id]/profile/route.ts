import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase-server";
import { ApiErrorCodes } from "@/lib/api-error-codes";
import { fillEmptyFromRuFields } from "@/lib/deepl-fill.server";
import { langFromRequest } from "@/lib/request-lang";
import { mergeI18nMap, parseI18nMap, resolveLocalizedField } from "@/lib/localized-records";

type NotesKey = "notes" | "extra_note" | "note" | null;
type AvatarKey = "avatar_path" | "avatar_url" | "photo_path" | null;

let NOTES_KEY: NotesKey = null;
let AVATAR_KEY: AvatarKey = null;

function errJson(message: string, status = 500, errorCode?: string) {
  const body: Record<string, unknown> = { error: message };
  if (errorCode) body.errorCode = errorCode;
  return NextResponse.json(body, { status });
}

async function resolveNotesKey(supabase: any): Promise<NotesKey> {
  if (NOTES_KEY) return NOTES_KEY;
  const candidates: NotesKey[] = ["notes", "extra_note", "note"];
  for (const k of candidates) {
    if (!k) continue;
    const { error } = await supabase.from("profiles").select(k).limit(1);
    if (!error) {
      NOTES_KEY = k;
      return k;
    }
    const msg = String((error as any)?.message || "");
    if (msg.includes("column") && msg.includes("does not exist")) continue;
  }
  NOTES_KEY = "notes";
  return NOTES_KEY;
}

async function resolveAvatarKey(supabase: any): Promise<AvatarKey> {
  if (AVATAR_KEY) return AVATAR_KEY;
  const candidates: AvatarKey[] = ["avatar_path", "avatar_url", "photo_path"];
  for (const k of candidates) {
    if (!k) continue;
    const { error } = await supabase.from("profiles").select(k).limit(1);
    if (!error) {
      AVATAR_KEY = k;
      return k;
    }
    const msg = String((error as any)?.message || "");
    if (msg.includes("column") && msg.includes("does not exist")) continue;
  }
  AVATAR_KEY = "avatar_path";
  return AVATAR_KEY;
}

function pick(obj: any, key: string): any {
  return obj?.[key];
}

function normMaybeString(v: any): string | null {
  if (v === null) return null;
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    const supabase = (guard as any).supabase;
    const lang = langFromRequest(req);

    const params = await ctx.params;
    const workerId = String(params?.id || "").trim();
    if (!workerId) {
      return errJson("Worker id is required", 400, ApiErrorCodes.WORKER_ID_REQUIRED);
    }

    const notesKey = await resolveNotesKey(supabase);
    const avatarKey = await resolveAvatarKey(supabase);

    const selectCols = ["id", "full_name", "full_name_i18n", "notes_i18n", "role", "active", "phone", "email"];
    if (notesKey) selectCols.push(notesKey);
    if (avatarKey) selectCols.push(avatarKey);

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select(selectCols.join(","))
      .eq("id", workerId)
      .maybeSingle();

    if (profErr) return errJson(profErr.message, 500);
    if (!prof) return errJson("Profile not found", 404, ApiErrorCodes.PROFILE_NOT_FOUND);

    let authEmail: string | null = null;
    let authPhone: string | null = null;
    try {
      const { data: u } = await supabase.auth.admin.getUserById(workerId);
      authEmail = u?.user?.email ?? null;
      authPhone = (u?.user as any)?.phone ?? null;
    } catch {
      // ignore
    }

    const baseNotes = notesKey ? pick(prof, notesKey) ?? null : null;
    const notesMap = parseI18nMap((prof as any).notes_i18n);
    const nameMap = parseI18nMap((prof as any).full_name_i18n);

    const out: any = {
      id: prof.id,
      full_name: resolveLocalizedField(lang, (prof as any).full_name ?? null, nameMap),
      full_name_i18n: nameMap,
      role: prof.role ?? null,
      active: prof.active ?? null,
      email: prof.email ?? authEmail ?? null,
      phone: prof.phone ?? authPhone ?? null,
      notes: baseNotes == null ? null : resolveLocalizedField(lang, String(baseNotes), notesMap),
      notes_i18n: notesMap,
      avatar_path: avatarKey ? pick(prof, avatarKey) ?? null : null,
    };

    return NextResponse.json({ worker: out });
  } catch (e: any) {
    return errJson(e?.message || "Unexpected error", 500);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req);
    const supabase = (guard as any).supabase;

    const params = await ctx.params;
    const workerId = String(params?.id || "").trim();
    if (!workerId) {
      return errJson("Worker id is required", 400, ApiErrorCodes.WORKER_ID_REQUIRED);
    }

    const body = await req.json().catch(() => ({} as any));

    const notesKey = await resolveNotesKey(supabase);
    const avatarKey = await resolveAvatarKey(supabase);

    const { data: existing, error: exErr } = await supabase
      .from("profiles")
      .select(`id,full_name,full_name_i18n,notes_i18n${notesKey ? `,${notesKey}` : ""}`)
      .eq("id", workerId)
      .maybeSingle();

    if (exErr) return errJson(exErr.message, 500);
    if (!existing) return errJson("Profile not found", 404, ApiErrorCodes.PROFILE_NOT_FOUND);

    let full_name_i18n = mergeI18nMap(
      parseI18nMap((existing as any).full_name_i18n),
      body?.full_name_i18n === undefined ? null : parseI18nMap(body.full_name_i18n),
    );
    let notes_i18n = mergeI18nMap(
      parseI18nMap((existing as any).notes_i18n),
      body?.notes_i18n === undefined ? null : parseI18nMap(body.notes_i18n),
    );

    const fillMissingTranslations = Boolean(body?.fillMissingTranslations);

    const ruName =
      Object.prototype.hasOwnProperty.call(body, "full_name") && body.full_name != null
        ? String(body.full_name)
        : String((existing as any).full_name ?? "");
    const ruNotesRaw = notesKey
      ? Object.prototype.hasOwnProperty.call(body, "notes")
        ? body.notes == null
          ? ""
          : String(body.notes)
        : String(pick(existing, notesKey!) ?? "")
      : "";

    if (fillMissingTranslations) {
      const filled = await fillEmptyFromRuFields({
        full_name: { ru: ruName, map: full_name_i18n },
        ...(notesKey
          ? {
              notes: { ru: ruNotesRaw || "", map: notes_i18n },
            }
          : {}),
      });
      if (filled.full_name_i18n) full_name_i18n = filled.full_name_i18n;
      if (filled.notes_i18n) notes_i18n = filled.notes_i18n;
    }

    const profilePatch: any = {};
    const authPatch: any = {};

    if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
      const v = body.full_name;
      profilePatch.full_name = v == null ? null : String(v);
    }

    if (notesKey && Object.prototype.hasOwnProperty.call(body, "notes")) {
      profilePatch[notesKey] = body.notes == null ? null : String(body.notes);
    }

    if (avatarKey && Object.prototype.hasOwnProperty.call(body, "avatar_path")) {
      profilePatch[avatarKey] = body.avatar_path == null ? null : String(body.avatar_path);
    }

    if (Object.prototype.hasOwnProperty.call(body, "phone")) {
      const phone = normMaybeString(body.phone);
      profilePatch.phone = phone;
      authPatch.phone = phone;
    }

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const email = normMaybeString(body.email);
      profilePatch.email = email;
      authPatch.email = email;
    }

    if (body?.full_name_i18n !== undefined || fillMissingTranslations) {
      profilePatch.full_name_i18n = full_name_i18n;
    }
    if (body?.notes_i18n !== undefined || fillMissingTranslations) {
      profilePatch.notes_i18n = notes_i18n;
    }

    if (
      Object.keys(profilePatch).length === 0 &&
      Object.keys(authPatch).length === 0
    ) {
      return errJson("Nothing to update", 400, ApiErrorCodes.NOTHING_TO_UPDATE);
    }

    if (Object.keys(authPatch).length > 0) {
      try {
        const { error: uErr } = await supabase.auth.admin.updateUserById(workerId, authPatch);
        if (uErr) return errJson(uErr.message, 400);
      } catch (e: any) {
        return errJson(String(e?.message || "Auth user update failed"), 400, ApiErrorCodes.AUTH_USER_UPDATE_FAILED);
      }
    }

    if (Object.keys(profilePatch).length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", workerId)
        .select("id,full_name,full_name_i18n,notes_i18n,role,active,phone,email")
        .maybeSingle();

      if (updErr) return errJson(updErr.message, 500);
      if (!updated) return errJson("Profile not found", 404, ApiErrorCodes.PROFILE_NOT_FOUND);
    }

    const lang = langFromRequest(req);
    const selectCols = ["id", "full_name", "full_name_i18n", "notes_i18n", "role", "active", "phone", "email"];
    if (notesKey) selectCols.push(notesKey);
    if (avatarKey) selectCols.push(avatarKey);

    const { data: prof2, error: profErr } = await supabase
      .from("profiles")
      .select(selectCols.filter(Boolean).join(","))
      .eq("id", workerId)
      .maybeSingle();

    if (profErr) return errJson(profErr.message, 500);

    let authEmail: string | null = null;
    let authPhone: string | null = null;
    try {
      const { data: u } = await supabase.auth.admin.getUserById(workerId);
      authEmail = u?.user?.email ?? null;
      authPhone = (u?.user as any)?.phone ?? null;
    } catch {
      // ignore
    }

    const baseNotes = notesKey ? pick(prof2 || {}, notesKey) ?? null : null;
    const notesMap = parseI18nMap((prof2 as any)?.notes_i18n);
    const nameMap = parseI18nMap((prof2 as any)?.full_name_i18n);

    const out: any = {
      id: prof2?.id || workerId,
      full_name: resolveLocalizedField(lang, (prof2 as any)?.full_name ?? null, nameMap),
      full_name_i18n: nameMap,
      role: (prof2 as any)?.role ?? null,
      active: (prof2 as any)?.active ?? null,
      email: (prof2 as any)?.email ?? authEmail ?? null,
      phone: (prof2 as any)?.phone ?? authPhone ?? null,
      notes: baseNotes == null ? null : resolveLocalizedField(lang, String(baseNotes), notesMap),
      notes_i18n: notesMap,
      avatar_path: avatarKey ? pick(prof2 || {}, avatarKey) ?? null : null,
    };

    return NextResponse.json({ worker: out });
  } catch (e: any) {
    return errJson(e?.message || "Unexpected error", 500);
  }
}
