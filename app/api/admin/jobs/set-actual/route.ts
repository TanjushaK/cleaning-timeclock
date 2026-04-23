import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hhmm(raw: string | null | undefined): string {
  const s = String(raw || '').trim()
  if (!s) return '00:00'
  // "HH:MM" or "HH:MM:SS" → "HH:MM"
  const m = /^(\d{2}):(\d{2})/.exec(s)
  if (!m) return '00:00'
  return `${m[1]}:${m[2]}`
}

function startFromJob(jobDate: string | null | undefined, scheduledTime: string | null | undefined): string {
  const d = String(jobDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date().toISOString()
  }
  const t = hhmm(scheduledTime)
  const iso = `${d}T${t}:00.000Z`
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return `${d}T00:00:00.000Z`
  return new Date(ms).toISOString()
}

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)
    const sb = guard.db

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id || body?.jobId || '').trim()
    if (!jobId) throw new ApiError(400, 'job_id is required', AdminApiErrorCode.JOB_ID_REQUIRED)

    let minutes: number | null = null
    if (body?.minutes != null) minutes = Math.max(0, Math.floor(Number(body.minutes) || 0))
    if (minutes === null && body?.hm != null) {
      const m = parseHM(String(body.hm))
      minutes = m == null ? null : Math.max(0, m)
    }
    if (minutes == null)
      throw new ApiError(400, 'minutes (number) or hm (e.g. "3:30") is required', AdminApiErrorCode.JOB_MINUTES_OR_HM_REQUIRED)

    // Берём все логи по смене.
    const { data: logs, error: logsErr } = await sb
      .from('time_logs')
      .select('id, started_at')
      .eq('job_id', jobId)
      .order('started_at', { ascending: true })

    if (logsErr) throw new ApiError(400, logsErr.message, AdminApiErrorCode.DB_ERROR)

    // Если логов нет — создаём "ручной" лог по расписанию смены.
    if (!logs || logs.length === 0) {
      const { data: job, error: jobErr } = await sb
        .from('jobs')
        .select('id, job_date, scheduled_time, worker_id')
        .eq('id', jobId)
        .maybeSingle()

      if (jobErr) throw new ApiError(400, jobErr.message, AdminApiErrorCode.DB_ERROR)
      if (!job) throw new ApiError(404, 'Shift not found', AdminApiErrorCode.JOB_NOT_FOUND)

      const startedAt = startFromJob((job as any).job_date, (job as any).scheduled_time)
      const startMs = new Date(startedAt).getTime()
      if (!Number.isFinite(startMs))
        throw new ApiError(400, 'Could not compute shift start', AdminApiErrorCode.JOB_SCHEDULE_START_INVALID)
      const stoppedAt = new Date(startMs + minutes * 60000).toISOString()

      const { error: insErr } = await sb.from('time_logs').insert({
        job_id: jobId,
        worker_id: (job as any).worker_id ?? null,
        started_at: startedAt,
        stopped_at: stoppedAt,
      })
      if (insErr) throw new ApiError(400, insErr.message, AdminApiErrorCode.DB_ERROR)

      return NextResponse.json({ ok: true, created: true, started_at: startedAt, stopped_at: stoppedAt, minutes, logs_removed: 0 })
    }

    const first = logs[0] as any
    const keepId = String(first.id)
    if (!keepId) throw new ApiError(400, 'time_logs.id is empty', AdminApiErrorCode.JOB_TIME_LOG_ID_MISSING)

    // Если у лога нет started_at — восстанавливаем из расписания.
    let startedAt = String(first.started_at || '').trim()
    if (!startedAt) {
      const { data: job, error: jobErr } = await sb
        .from('jobs')
        .select('id, job_date, scheduled_time')
        .eq('id', jobId)
        .maybeSingle()
      if (jobErr) throw new ApiError(400, jobErr.message, AdminApiErrorCode.DB_ERROR)
      startedAt = startFromJob((job as any)?.job_date, (job as any)?.scheduled_time)
      const { error: updStartErr } = await sb.from('time_logs').update({ started_at: startedAt }).eq('id', keepId)
      if (updStartErr) throw new ApiError(400, updStartErr.message, AdminApiErrorCode.DB_ERROR)
    }

    const startMs = new Date(startedAt).getTime()
    if (!Number.isFinite(startMs))
      throw new ApiError(400, 'Invalid started_at', AdminApiErrorCode.TIME_LOG_STARTED_AT_INVALID)

    const stoppedAt = new Date(startMs + minutes * 60000).toISOString()
    const { error: updErr } = await sb.from('time_logs').update({ stopped_at: stoppedAt }).eq('id', keepId)
    if (updErr) throw new ApiError(400, updErr.message, AdminApiErrorCode.DB_ERROR)

    // Чтобы итог всегда был ровно тот, что выставил админ — убираем остальные логи.
    const otherIds = (logs as any[]).slice(1).map((x) => String(x.id)).filter(Boolean)
    let removed = 0
    if (otherIds.length) {
      const { error: delErr } = await sb.from('time_logs').delete().in('id', otherIds)
      if (delErr) throw new ApiError(400, delErr.message, AdminApiErrorCode.DB_ERROR)
      removed = otherIds.length
    }

    return NextResponse.json({ ok: true, created: false, started_at: startedAt, stopped_at: stoppedAt, minutes, logs_removed: removed })
  } catch (e) {
    return toErrorResponse(e)
  }
}
