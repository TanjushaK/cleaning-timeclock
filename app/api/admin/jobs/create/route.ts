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

  const { data: prof, error: profErr } = await sb.from('profiles').select('id, role, active').eq('id', userData.user.id).single()
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

let JOBS_END_TIME_COL: string | null | undefined = undefined

async function resolveJobsEndTimeColumn(admin: SupabaseClient) {
  if (JOBS_END_TIME_COL !== undefined) return JOBS_END_TIME_COL

  const candidates = ['scheduled_time_to', 'scheduled_end_time', 'scheduled_time_end', 'end_time', 'time_to', 'scheduled_to']
  for (const c of candidates) {
    const { error } = await admin.from('jobs').select(c).limit(1)
    if (!error) {
      JOBS_END_TIME_COL = c
      return c
    }

    const msg = String(error?.message || '')
    const missing = msg.includes('does not exist') || msg.includes('Could not find') || msg.includes('column') || msg.includes('unknown')
    if (!missing) {
      // какая-то другая ошибка — всё равно запомним колонку, чтобы не крутить детектор бесконечно
      JOBS_END_TIME_COL = c
      return c
    }
  }

  JOBS_END_TIME_COL = null
  return null
}

function normalizeHHMM(v: string) {
  const t = String(v || '').trim()
  if (!t) return null
  return t.length === 5 ? `${t}:00` : t
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))

    const siteId = String(body?.site_id || '').trim()
    const jobDate = String(body?.job_date || '').trim() // YYYY-MM-DD
    const scheduledTime = String(body?.scheduled_time || '').trim() // HH:MM

    const scheduledTimeToRaw =
      body?.scheduled_time_to ?? body?.scheduled_end_time ?? body?.scheduled_time_end ?? body?.end_time ?? body?.time_to ?? null

    const workerIdsRaw = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    const workerIds = workerIdsRaw.map((x: any) => String(x).trim()).filter(Boolean)

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
      const { data: ex, error: exErr } = await admin.from(assignTable).select('site_id,worker_id').eq('site_id', siteId).eq('worker_id', wid).limit(1)
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
      if (!Array.isArray(ex) || ex.length === 0) {
        const { error: insAErr } = await admin.from(assignTable).insert([{ site_id: siteId, worker_id: wid }])
        if (insAErr) return NextResponse.json({ error: insAErr.message }, { status: 500 })
      }
    }

    const timeFrom = normalizeHHMM(scheduledTime)
    if (!timeFrom) return NextResponse.json({ error: 'scheduled_time обязателен' }, { status: 400 })

    const timeTo = scheduledTimeToRaw == null ? null : normalizeHHMM(String(scheduledTimeToRaw))
    const endCol = timeTo ? await resolveJobsEndTimeColumn(admin) : null

    const rows = workerIds.map((worker_id: string) => {
      const row: Record<string, any> = {
        site_id: siteId,
        worker_id,
        job_date: jobDate,
        scheduled_time: timeFrom,
        status: 'planned',
      }
      if (endCol && timeTo) row[endCol] = timeTo
      return row
    })

    const { data, error } = await admin.from('jobs').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
