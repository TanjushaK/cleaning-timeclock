import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function envOrThrow(name: string) {
  const v = process.env[name]
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
      ASSIGNMENTS_TABLE = t
      return t
    }
  }

  throw new Error('Не найдена таблица назначений (assignments/site_workers).')
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))

    const siteId = String(body?.site_id || '').trim()
    const jobDate = String(body?.job_date || '').trim() // YYYY-MM-DD
    const scheduledTime = String(body?.scheduled_time || '').trim() // HH:MM

    const workerIdsRaw = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    const workerIds = workerIdsRaw.map((x: any) => String(x).trim()).filter(Boolean)

    let plannedMinutes = 60
    if (body?.planned_minutes != null) {
      const n = Number(body.planned_minutes)
      if (!Number.isFinite(n) || n < 1 || n > 1440) {
        return NextResponse.json({ error: 'planned_minutes должен быть числом 1..1440' }, { status: 400 })
      }
      plannedMinutes = Math.round(n)
    }

    if (!siteId) return NextResponse.json({ error: 'site_id обязателен' }, { status: 400 })
    if (!jobDate) return NextResponse.json({ error: 'job_date обязателен' }, { status: 400 })
    if (!scheduledTime) return NextResponse.json({ error: 'scheduled_time обязателен' }, { status: 400 })
    if (workerIds.length === 0) return NextResponse.json({ error: 'Выбери хотя бы одного работника' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // Чтобы у работников не было “пусто”, гарантируем назначение объект↔работник
    const assignTable = await resolveAssignmentsTable(admin)
    for (const wid of workerIds) {
      const { data: ex, error: exErr } = await admin
        .from(assignTable)
        .select('site_id,worker_id')
        .eq('site_id', siteId)
        .eq('worker_id', wid)
        .limit(1)

      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
      if (!Array.isArray(ex) || ex.length === 0) {
        const { error: insAErr } = await admin.from(assignTable).insert([{ site_id: siteId, worker_id: wid }])
        if (insAErr) return NextResponse.json({ error: insAErr.message }, { status: 500 })
      }
    }

    const time = scheduledTime.length === 5 ? `${scheduledTime}:00` : scheduledTime

    const rows = workerIds.map((worker_id: string) => ({
      site_id: siteId,
      worker_id,
      job_date: jobDate,
      scheduled_time: time,
      planned_minutes: plannedMinutes,
      status: 'planned',
    }))

    const { data, error } = await admin.from('jobs').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
