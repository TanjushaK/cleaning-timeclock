import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase-server'

type NotesKey = 'notes' | 'extra_note' | 'note' | null
type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path' | null

let NOTES_KEY: NotesKey = null
let AVATAR_KEY: AvatarKey = null

function errJson(message: string, status = 500, extra?: any) {
  return NextResponse.json({ error: message, ...(extra ? { extra } : {}) }, { status })
}

async function resolveNotesKey(supabase: any): Promise<NotesKey> {
  if (NOTES_KEY) return NOTES_KEY
  const candidates: NotesKey[] = ['notes', 'extra_note', 'note']
  for (const k of candidates) {
    if (!k) continue
    const { error } = await supabase.from('profiles').select(k).limit(1)
    if (!error) {
      NOTES_KEY = k
      return k
    }
    const msg = String((error as any)?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  NOTES_KEY = 'notes'
  return NOTES_KEY
}

async function resolveAvatarKey(supabase: any): Promise<AvatarKey> {
  if (AVATAR_KEY) return AVATAR_KEY
  const candidates: AvatarKey[] = ['avatar_path', 'avatar_url', 'photo_path']
  for (const k of candidates) {
    if (!k) continue
    const { error } = await supabase.from('profiles').select(k).limit(1)
    if (!error) {
      AVATAR_KEY = k
      return k
    }
    const msg = String((error as any)?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  AVATAR_KEY = 'avatar_path'
  return AVATAR_KEY
}

function pick(obj: any, key: string): any {
  return obj?.[key]
}

function normMaybeString(v: any): string | null {
  if (v === null) return null
  const s = String(v ?? '').trim()
  return s ? s : null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req)
    const supabase = (guard as any).supabase

    const params = await ctx.params
    const workerId = String(params?.id || '').trim()
    if (!workerId) return errJson('id обязателен', 400)

    const notesKey = await resolveNotesKey(supabase)
    const avatarKey = await resolveAvatarKey(supabase)

    const selectCols = ['id', 'full_name', 'role', 'active']
    if (notesKey) selectCols.push(notesKey)
    if (avatarKey) selectCols.push(avatarKey)

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select(selectCols.join(','))
      .eq('id', workerId)
      .maybeSingle()

    if (profErr) return errJson(profErr.message, 500)
    if (!prof) return errJson('Профиль не найден', 404)

    // email/phone — из Auth (если доступно)
    let email: string | null = null
    let phone: string | null = null
    try {
      const { data: u } = await supabase.auth.admin.getUserById(workerId)
      email = u?.user?.email ?? null
      phone = (u?.user as any)?.phone ?? null
    } catch {
      // ignore
    }

    const out: any = {
      id: prof.id,
      full_name: prof.full_name ?? null,
      role: prof.role ?? null,
      active: prof.active ?? null,
      email,
      phone,
      notes: notesKey ? pick(prof, notesKey) ?? null : null,
      avatar_path: avatarKey ? pick(prof, avatarKey) ?? null : null,
    }

    return NextResponse.json({ worker: out })
  } catch (e: any) {
    return errJson(e?.message || 'Unexpected error', 500)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req)
    const supabase = (guard as any).supabase

    const params = await ctx.params
    const workerId = String(params?.id || '').trim()
    if (!workerId) return errJson('id обязателен', 400)

    const body = await req.json().catch(() => ({} as any))

    const notesKey = await resolveNotesKey(supabase)
    const avatarKey = await resolveAvatarKey(supabase)

    const profilePatch: any = {}
    const authPatch: any = {}

    // profiles
    if (Object.prototype.hasOwnProperty.call(body, 'full_name')) {
      profilePatch.full_name = body.full_name == null ? null : String(body.full_name)
    }
    if (notesKey && Object.prototype.hasOwnProperty.call(body, 'notes')) {
      profilePatch[notesKey] = body.notes == null ? null : String(body.notes)
    }
    if (avatarKey && Object.prototype.hasOwnProperty.call(body, 'avatar_path')) {
      profilePatch[avatarKey] = body.avatar_path == null ? null : String(body.avatar_path)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      profilePatch.phone = normMaybeString(body.phone)
      authPatch.phone = normMaybeString(body.phone)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'email')) {
      profilePatch.email = normMaybeString(body.email)
      authPatch.email = normMaybeString(body.email)
    }

    let did = false

    // Update Auth user (email/phone)
    if (Object.keys(authPatch).length > 0) {
      try {
        const { error: uErr } = await supabase.auth.admin.updateUserById(workerId, authPatch)
        if (uErr) return errJson(uErr.message, 400)
        did = true
      } catch (e: any) {
        return errJson(String(e?.message || 'Не удалось обновить Auth пользователя'), 400)
      }
    }

    // Update profiles row
    if (Object.keys(profilePatch).length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from('profiles')
        .update(profilePatch)
        .eq('id', workerId)
        .select('id,full_name,role,active,phone,email')
        .maybeSingle()

      if (updErr) return errJson(updErr.message, 500)
      if (!updated) return errJson('Профиль не найден', 404)
      did = true
    }

    if (!did) return errJson('Нечего обновлять', 400)

    // вернём worker как в GET
    let email: string | null = null
    let phone: string | null = null
    try {
      const { data: u } = await supabase.auth.admin.getUserById(workerId)
      email = u?.user?.email ?? null
      phone = (u?.user as any)?.phone ?? null
    } catch {
      // ignore
    }

    const selectCols = ['id', 'full_name', 'role', 'active']
    if (notesKey) selectCols.push(notesKey)
    if (avatarKey) selectCols.push(avatarKey)
    selectCols.push('phone', 'email')

    const { data: prof2 } = await supabase
      .from('profiles')
      .select(selectCols.filter(Boolean).join(','))
      .eq('id', workerId)
      .maybeSingle()

    const out: any = {
      id: prof2?.id || workerId,
      full_name: (prof2 as any)?.full_name ?? null,
      role: (prof2 as any)?.role ?? null,
      active: (prof2 as any)?.active ?? null,
      email,
      phone,
      notes: notesKey ? pick(prof2 || {}, notesKey) ?? null : null,
      avatar_path: avatarKey ? pick(prof2 || {}, avatarKey) ?? null : null,
    }

    return NextResponse.json({ worker: out })
  } catch (e: any) {
    return errJson(e?.message || 'Unexpected error', 500)
  }
}
