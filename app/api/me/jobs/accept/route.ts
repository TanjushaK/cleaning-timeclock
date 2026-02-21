import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let ASSIGN_TABLE: string | null | undefined = undefined

async function resolveAssignmentsTable(supabase: any): Promise<string | null> {
  if (ASSIGN_TABLE !== undefined) return ASSIGN_TABLE
  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await supabase.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGN_TABLE = t
      return t
    }
    const msg = String(error?.message || '')
    const missing = msg.includes('Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    if (!missing) {
      ASSIGN_TABLE = t
      return t
    }
  }
  ASSIGN_TABLE = null
  return null
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)
    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.jobId || body?.job_id || body?.id || '').trim()
    if (!jobId) throw new ApiError(400, 'Нужен jobId')

    const { data: job, error: jErr } = await supabase
      .from('jobs')
      .select('id,status,worker_id,site_id')
      .eq('id', jobId)
      .maybeSingle()

    if (jErr) throw new ApiError(400, jErr.message)
    if (!job) throw new ApiError(404, 'Смена не найдена')

    if (job.status !== 'planned') throw new ApiError(400, 'Принять можно только запланированную смену')

    if (job.worker_id && String(job.worker_id) === String(userId)) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (job.worker_id) throw new ApiError(409, 'Смена уже занята')

    const siteId = String(job.site_id || '').trim()
    if (!siteId) throw new ApiError(400, 'У смены нет site_id')

    const t = await resolveAssignmentsTable(supabase)
    if (!t) throw new ApiError(500, 'Не найдена таблица назначений')

    const { data: a, error: aErr } = await supabase
      .from(t)
      .select('site_id,worker_id')
      .eq('site_id', siteId)
      .eq('worker_id', userId)
      .limit(1)

    if (aErr) throw new ApiError(400, aErr.message)
    if (!Array.isArray(a) || a.length === 0) throw new ApiError(403, 'Нет доступа к объекту')

    const { error: updErr } = await supabase
      .from('jobs')
      .update({ worker_id: userId })
      .eq('id', jobId)
      .is('worker_id', null)

    if (updErr) throw new ApiError(400, updErr.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
