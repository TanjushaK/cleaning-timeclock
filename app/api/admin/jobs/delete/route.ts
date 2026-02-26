import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)
    const sb = guard.supabase

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id || body?.jobId || '').trim()
    if (!jobId) throw new ApiError(400, 'job_id обязателен')

    // 1) Ensure job exists
    const { data: job, error: jobErr } = await sb.from('jobs').select('id, status').eq('id', jobId).maybeSingle()
    if (jobErr) throw new ApiError(400, jobErr.message)
    if (!job) throw new ApiError(404, 'Смена не найдена')

    // 2) Delete dependent rows first (FK-safe)
    const del = async (table: string, filterCol: string) => {
      const { error } = await sb.from(table).delete().eq(filterCol, jobId)
      if (error) throw new ApiError(400, `${table}: ${error.message}`)
    }

    // Known tables in this project
    await del('time_logs', 'job_id')
    await del('job_events', 'job_id')
    await del('job_workers', 'job_id')

    // 3) Delete the job itself
    const { error: jobDelErr } = await sb.from('jobs').delete().eq('id', jobId)
    if (jobDelErr) throw new ApiError(400, jobDelErr.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
