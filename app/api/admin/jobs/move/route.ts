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

    const jobId = String(body?.job_id || '').trim()
    if (!jobId) return NextResponse.json({ error: 'job_id обязателен' }, { status: 400 })

    const patch: Record<string, any> = {}

    if (body?.site_id != null) patch.site_id = String(body.site_id).trim() || null
    if (body?.worker_id != null) patch.worker_id = String(body.worker_id).trim() || null
    if (body?.job_date != null) patch.job_date = String(body.job_date).trim() || null
    if (body?.scheduled_time != null) {
      const t = normalizeHHMM(String(body.scheduled_time))
      patch.scheduled_time = t
    }

    const scheduledTimeToRaw =
      body?.scheduled_time_to ?? body?.scheduled_end_time ?? body?.scheduled_time_end ?? body?.end_time ?? body?.time_to ?? null

    const wantsTimeToUpdate = scheduledTimeToRaw !== null && scheduledTimeToRaw !== undefined
    const timeTo = wantsTimeToUpdate ? normalizeHHMM(String(scheduledTimeToRaw)) : null

    if (body?.status != null) patch.status = String(body.status).trim() || null

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    if (wantsTimeToUpdate) {
      const endCol = await resolveJobsEndTimeColumn(admin)
      if (endCol) patch[endCol] = timeTo
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })

    const { data: logs, error: logsErr } = await admin.from('time_logs').select('id').eq('job_id', jobId).limit(1)
    if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 })

    const hasLogs = Array.isArray(logs) && logs.length > 0

    if (hasLogs) {
      if (patch.worker_id != null && patch.worker_id !== undefined) {
        return NextResponse.json({ error: 'Нельзя сменить работника: по смене уже есть отметки времени.' }, { status: 400 })
      }
      if (patch.site_id != null && patch.site_id !== undefined) {
        return NextResponse.json({ error: 'Нельзя сменить объект: по смене уже есть отметки времени.' }, { status: 400 })
      }
      if (patch.job_date != null && patch.job_date !== undefined) {
        return NextResponse.json({ error: 'Нельзя сменить дату: по смене уже есть отметки времени.' }, { status: 400 })
      }
      if (patch.scheduled_time != null && patch.scheduled_time !== undefined) {
        return NextResponse.json({ error: 'Нельзя сменить время: по смене уже есть отметки времени.' }, { status: 400 })
      }

      const endCol = await resolveJobsEndTimeColumn(admin)
      if (endCol && patch[endCol] != null && patch[endCol] !== undefined) {
        return NextResponse.json({ error: 'Нельзя сменить время окончания: по смене уже есть отметки времени.' }, { status: 400 })
      }
    }

    const { error } = await admin.from('jobs').update(patch).eq('id', jobId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
