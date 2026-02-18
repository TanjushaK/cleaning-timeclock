import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse } from '@/lib/supabase-server'

type NotesKey = 'notes' | 'extra_note' | 'note' | null
type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path' | null

let NOTES_KEY: NotesKey = null
let AVATAR_KEY: AvatarKey = null

async function resolveNotesKey(sb: any): Promise<NotesKey> {
  if (NOTES_KEY) return NOTES_KEY
  const candidates: NotesKey[] = ['notes', 'extra_note', 'note']
  for (const k of candidates) {
    if (!k) continue
    const { error } = await sb.from('profiles').select(k).limit(1)
    if (!error) {
      NOTES_KEY = k
      return k
    }
    const msg = String(error?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
    // если ошибка не про колонку — не гадаем, но пусть будет notes
  }
  NOTES_KEY = 'notes'
  return NOTES_KEY
}

async function resolveAvatarKey(sb: any): Promise<AvatarKey> {
  if (AVATAR_KEY) return AVATAR_KEY
  const candidates: AvatarKey[] = ['avatar_path', 'avatar_url', 'photo_path']
  for (const k of candidates) {
    if (!k) continue
    const { error } = await sb.from('profiles').select(k).limit(1)
    if (!error) {
      AVATAR_KEY = k
      return k
    }
    const msg = String(error?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  AVATAR_KEY = 'avatar_path'
  return AVATAR_KEY
}

function pick<T extends Record<string, any>>(obj: T, key: string): any {
  return (obj as any)?.[key]
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req)

    const params = await ctx.params
    const workerId = String(params?.id || '').trim()
    if (!workerId) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

    const notesKey = await resolveNotesKey(guard.supabase)
    const avatarKey = await resolveAvatarKey(guard.supabase)

    const selectCols = ['id', 'full_name', 'role', 'active']
    if (notesKey) selectCols.push(notesKey)
    if (avatarKey) selectCols.push(avatarKey)

    const { data: prof, error: profErr } = await guard.supabase
      .from('profiles')
      .select(selectCols.join(','))
      .eq('id', workerId)
      .maybeSingle()

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })
    if (!prof) return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })

    // email/phone — из Auth (если доступно)
    let email: string | null = null
    let phone: string | null = null
    try {
      const { data: u } = await guard.supabase.auth.admin.getUserById(workerId)
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
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin(req)

    const params = await ctx.params
    const workerId = String(params?.id || '').trim()
    if (!workerId) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

    const body = await req.json().catch(() => ({} as any))

    const notesKey = await resolveNotesKey(guard.supabase)
    const avatarKey = await resolveAvatarKey(guard.supabase)

    const patch: any = {}

    if (Object.prototype.hasOwnProperty.call(body, 'full_name')) {
      const v = body.full_name
      patch.full_name = v == null ? null : String(v)
    }

    if (notesKey && Object.prototype.hasOwnProperty.call(body, 'notes')) {
      patch[notesKey] = body.notes == null ? null : String(body.notes)
    }

    if (avatarKey && Object.prototype.hasOwnProperty.call(body, 'avatar_path')) {
      patch[avatarKey] = body.avatar_path == null ? null : String(body.avatar_path)
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    const { data: updated, error: updErr } = await guard.supabase
      .from('profiles')
      .update(patch)
      .eq('id', workerId)
      .select('id,full_name,role,active')
      .maybeSingle()

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })

    // вернём worker как в GET
    let email: string | null = null
    let phone: string | null = null
    try {
      const { data: u } = await guard.supabase.auth.admin.getUserById(workerId)
      email = u?.user?.email ?? null
      phone = (u?.user as any)?.phone ?? null
    } catch {
      // ignore
    }

    const { data: prof2 } = await guard.supabase
      .from('profiles')
      .select([
        'id',
        'full_name',
        'role',
        'active',
        notesKey || '',
        avatarKey || '',
      ].filter(Boolean).join(','))
      .eq('id', workerId)
      .maybeSingle()

    const out: any = {
      id: prof2?.id || updated.id,
      full_name: prof2?.full_name ?? updated.full_name ?? null,
      role: prof2?.role ?? updated.role ?? null,
      active: prof2?.active ?? updated.active ?? null,
      email,
      phone,
      notes: notesKey ? pick(prof2 || {}, notesKey) ?? null : null,
      avatar_path: avatarKey ? pick(prof2 || {}, avatarKey) ?? null : null,
    }

    return NextResponse.json({ worker: out })
  } catch (e) {
    return toErrorResponse(e)
  }
}
