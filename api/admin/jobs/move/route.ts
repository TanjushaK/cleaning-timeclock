import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pickStr(v: any): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function normalizeTimeHHMM(v: any): string | null {
  const s = pickStr(v)
  if (!s) return null
  // allow "HH:MM" or "HH:MM:SS"
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  return null
}

function hasOwn(obj: any, key: string) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizeStatus(v: any): string | null {
  const s = pickStr(v)
  if (!s) return null
  if (s === 'planned' || s === 'in_progress' || s === 'done') return s
  if (s === 'cancelled') throw new ApiError(400, 'Отмена делается кнопкой “Отменить смену”')
  throw new ApiError(400, 'Недопустимый статус')
}

/**
 * Update a job (shift).
 * Supports:
 *  - job_id | jobId | id
 *  - job_date (YYYY-MM-DD)
 *  - scheduled_time (HH:MM)
 *  - scheduled_end_time (HH:MM) or null
 *  - site_id (uuid) or null
 *  - worker_id (uuid) or null
 *  - status (planned|in_progress|done)
 */
export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)

    const body: any = await req.json().catch(() => ({}))

    const jobId =
      pickStr(body?.job_id) ??
      pickStr(body?.jobId) ??
      pickStr(body?.id) ??
      pickStr(body?.job?.id)

    if (!jobId) throw new ApiError(400, 'Missing job_id')

    const patch: any = {}

    const jobDate = pickStr(body?.job_date) ?? pickStr(body?.to_date) ?? pickStr(body?.toDate) ?? pickStr(body?.date)
    if (jobDate) patch.job_date = jobDate

    const tFromRaw = hasOwn(body, 'scheduled_time') ? body.scheduled_time : (hasOwn(body, 'to_time') ? body.to_time : (hasOwn(body, 'toTime') ? body.toTime : (hasOwn(body, 'time') ? body.time : undefined)))
    if (tFromRaw !== undefined) {
      const t = normalizeTimeHHMM(tFromRaw)
      if (!t) throw new ApiError(400, 'scheduled_time должен быть HH:MM')
      patch.scheduled_time = t
    }

    const tToRaw = hasOwn(body, 'scheduled_end_time') ? body.scheduled_end_time : (hasOwn(body, 'scheduled_time_to') ? body.scheduled_time_to : (hasOwn(body, 'to_time_to') ? body.to_time_to : (hasOwn(body, 'end_time') ? body.end_time : undefined)))
    if (tToRaw !== undefined) {
      if (tToRaw === null || tToRaw === '') {
        patch.scheduled_end_time = null
      } else {
        const t = normalizeTimeHHMM(tToRaw)
        if (!t) throw new ApiError(400, 'scheduled_end_time должен быть HH:MM')
        patch.scheduled_end_time = t
      }
    }

    const siteIdRaw = hasOwn(body, 'site_id') ? body.site_id : (hasOwn(body, 'to_site_id') ? body.to_site_id : (hasOwn(body, 'toSiteId') ? body.toSiteId : undefined))
    if (siteIdRaw !== undefined) patch.site_id = pickStr(siteIdRaw)

    const workerIdRaw = hasOwn(body, 'worker_id') ? body.worker_id : undefined
    if (workerIdRaw !== undefined) patch.worker_id = pickStr(workerIdRaw)

    if (hasOwn(body, 'status')) {
      const s = normalizeStatus(body.status)
      if (s) patch.status = s
    }

    if (Object.keys(patch).length === 0) throw new ApiError(400, 'Nothing to update')

    const { data, error } = await guard.supabase
      .from('jobs')
      .update(patch)
      .eq('id', jobId)
      .select('id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id')
      .maybeSingle()

    if (error) throw new ApiError(400, error.message)
    if (!data) throw new ApiError(404, 'Job not found')

    return NextResponse.json({ ok: true, job: data })
  } catch (e: any) {
    if (e instanceof ApiError) return toErrorResponse(e)
    return toErrorResponse(e)
  }
}

