import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const sb = guard.supabase

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id || body?.jobId || '').trim()
    if (!jobId) throw new ApiError(400, 'job_id обязателен')

    let minutes: number | null = null
    if (body?.minutes != null) minutes = Math.max(0, Math.floor(Number(body.minutes) || 0))
    if (minutes === null && body?.hm != null) {
      const m = parseHM(String(body.hm))
      minutes = m == null ? null : Math.max(0, m)
    }
    if (minutes == null) throw new ApiError(400, 'Нужен minutes (число) или hm (например "3:30")')

    const { data: log, error: logErr } = await sb
      .from('time_logs')
      .select('id, started_at, stopped_at')
      .eq('job_id', jobId)
      .order('started_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (logErr) throw new ApiError(400, logErr.message)
    if (!log || !log.id) throw new ApiError(400, 'По этой смене нет time_logs (нечего править)')

    const startedAt = String((log as any).started_at || '').trim()
    if (!startedAt) throw new ApiError(400, 'У time_logs нет started_at')

    const startMs = new Date(startedAt).getTime()
    if (!Number.isFinite(startMs)) throw new ApiError(400, 'started_at некорректный')

    const stopMs = startMs + minutes * 60000
    const stoppedAt = new Date(stopMs).toISOString()

    const { error: updErr } = await sb.from('time_logs').update({ stopped_at: stoppedAt }).eq('id', String(log.id))
    if (updErr) throw new ApiError(400, updErr.message)

    return NextResponse.json({ ok: true, started_at: startedAt, stopped_at: stoppedAt, minutes })
  } catch (e) {
    return toErrorResponse(e)
  }
}
