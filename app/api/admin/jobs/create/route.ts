import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { requireAdminBearer } from '@/lib/admin-bearer-guard'
import { ApiErrorCodes } from '@/lib/api-error-codes'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { jsonApiError } from '@/lib/json-api-error'

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

  throw Object.assign(new Error('Assignments table not found'), { code: AppApiErrorCodes.ASSIGNMENTS_TABLE_MISSING })
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
    const guard = await requireAdminBearer(req)
    if (!guard.ok) return guard.response

    const body = await req.json().catch(() => ({} as any))

    const siteId = String(body?.site_id || '').trim()
    const jobDate = String(body?.job_date || '').trim() // YYYY-MM-DD
    const scheduledTime = String(body?.scheduled_time || '').trim() // HH:MM

    const scheduledTimeToRaw =
      body?.scheduled_time_to ?? body?.scheduled_end_time ?? body?.scheduled_time_end ?? body?.end_time ?? body?.time_to ?? null

    const workerIdsRaw = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    const workerIds = workerIdsRaw.map((x: any) => String(x).trim()).filter(Boolean)

    if (!siteId) return jsonApiError(400, ApiErrorCodes.SITE_ID_REQUIRED, 'site_id is required')
    if (!jobDate) return jsonApiError(400, ApiErrorCodes.JOB_DATE_REQUIRED, 'job_date is required')
    if (!scheduledTime) return jsonApiError(400, ApiErrorCodes.SCHEDULED_TIME_REQUIRED, 'scheduled_time is required')
    if (workerIds.length === 0) return jsonApiError(400, ApiErrorCodes.AT_LEAST_ONE_WORKER, 'Select at least one worker')

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // Чтобы у работников не было “пусто”, гарантируем назначение объект↔работник
    const assignTable = await resolveAssignmentsTable(admin)
    for (const wid of workerIds) {
      const { data: ex, error: exErr } = await admin.from(assignTable).select('site_id,worker_id').eq('site_id', siteId).eq('worker_id', wid).limit(1)
      if (exErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, exErr.message)
      if (!Array.isArray(ex) || ex.length === 0) {
        const { error: insAErr } = await admin.from(assignTable).insert([{ site_id: siteId, worker_id: wid }])
        if (insAErr) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, insAErr.message)
      }
    }

    const timeFrom = normalizeHHMM(scheduledTime)
    if (!timeFrom) return jsonApiError(400, ApiErrorCodes.SCHEDULED_TIME_REQUIRED, 'scheduled_time is required')

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
    if (error) return jsonApiError(500, ApiErrorCodes.ADMIN_QUERY_FAILED, error.message)

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e: any) {
    const code = (e as any)?.code
    if (code === AppApiErrorCodes.ASSIGNMENTS_TABLE_MISSING) {
      return jsonApiError(500, AppApiErrorCodes.ASSIGNMENTS_TABLE_MISSING, String(e?.message || 'Assignments table not found'))
    }
    return jsonApiError(500, ApiErrorCodes.ADMIN_INTERNAL, String(e?.message || e || 'Server error'))
  }
}
