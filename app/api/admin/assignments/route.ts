import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? '').replace(/\uFEFF/g, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function envOrThrow(name: string) {
  const v = cleanEnv(process.env[name])
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function assertAdmin(req: NextRequest) {
  const token = bearer(req)
  if (!token) return { ok: false as const, status: 401, error: 'Нет входа. Авторизуйся в админке.' }

  const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
  const anon = envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false as const, status: 401, error: 'Невалидный токен' }

  const { data: prof, error: profErr } = await sb
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .single()

  if (profErr || !prof) return { ok: false as const, status: 403, error: 'Профиль не найден' }
  if (prof.role !== 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'Доступ запрещён' }

  return { ok: true as const }
}

let ASSIGNMENTS_TABLE: string | null = null

async function resolveAssignmentsTable(admin: SupabaseClient) {
  if (ASSIGNMENTS_TABLE) return ASSIGNMENTS_TABLE

  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await admin.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGNMENTS_TABLE = t
      return t
    }
    const msg = String(error?.message || '')
    const missing = msg.includes('Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    if (!missing) {
      // Таблица есть, но проблема другая — всё равно выберем, чтобы не уходить в “0”
      ASSIGNMENTS_TABLE = t
      return t
    }
  }

  throw new Error('Не найдена таблица назначений (assignments/site_workers).')
}

export async function GET(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const table = await resolveAssignmentsTable(admin)

    const { data, error } = await admin.from(table).select('site_id,worker_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ assignments: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const action = String(body?.action || '').trim() // 'assign' | 'unassign' (может быть пусто)
    const siteId = String(body?.site_id || '').trim()
    const workerId = String(body?.worker_id || body?.profile_id || '').trim()

    if (!siteId) return NextResponse.json({ error: 'site_id обязателен' }, { status: 400 })
    if (!workerId) return NextResponse.json({ error: 'worker_id обязателен' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const table = await resolveAssignmentsTable(admin)

    // Если action не пришёл — угадываем по наличию флага
    const mode = action || (body?.unassign ? 'unassign' : 'assign')

    if (mode === 'unassign') {
      const { data, error } = await admin
        .from(table)
        .delete()
        .eq('site_id', siteId)
        .eq('worker_id', workerId)
        .select('site_id,worker_id')

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const deleted = Array.isArray(data) ? data.length : 0
      if (deleted === 0) {
        return NextResponse.json({ ok: true, deleted: 0, note: 'Запись не найдена (уже снято).' })
      }

      return NextResponse.json({ ok: true, deleted })
    }

    // assign: сначала проверим, нет ли уже назначения
    const { data: exists, error: existsErr } = await admin
      .from(table)
      .select('site_id,worker_id')
      .eq('site_id', siteId)
      .eq('worker_id', workerId)
      .limit(1)

    if (existsErr) return NextResponse.json({ error: existsErr.message }, { status: 500 })
    if (Array.isArray(exists) && exists.length > 0) return NextResponse.json({ ok: true, created: false })

    const { error: insErr } = await admin.from(table).insert([{ site_id: siteId, worker_id: workerId }])
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, created: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
