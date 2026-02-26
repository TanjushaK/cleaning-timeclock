import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SupabaseErr = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

async function deleteRowsByJobId(
  supabase: any,
  table: string,
  jobId: string,
  columns: string[]
): Promise<{ ok: true; used?: string } | { ok: false; error: SupabaseErr } | { ok: true; skipped: true }> {
  // Try each possible column name; ignore "column does not exist" errors (42703).
  // Ignore missing table errors (42P01) as "skipped".
  for (const col of columns) {
    const res = await supabase.from(table).delete().eq(col, jobId)
    if (!res?.error) return { ok: true, used: col }

    const err = res.error as SupabaseErr
    if (err?.code === '42703') continue
    if (err?.code === '42P01') return { ok: true, skipped: true }
    return { ok: false, error: err }
  }
  return { ok: true, skipped: true }
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)
    const sb = guard.supabase

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id ?? body?.jobId ?? body?.id ?? '').trim()
    const force = Boolean(body?.force)

    if (!jobId) throw new ApiError(400, 'job_id обязателен')

    const jobRes = await sb.from('jobs').select('id,status').eq('id', jobId).maybeSingle()
    if (jobRes.error) throw new ApiError(500, jobRes.error.message)
    if (!jobRes.data) throw new ApiError(404, 'Job not found')

    // By default allow deleting only done jobs (extreme recovery). Use force for other statuses.
    const st = String(jobRes.data.status || '')
    if (!force && st !== 'done') {
      throw new ApiError(409, 'Можно удалить только завершённую смену (status=done). Для принудительного удаления нужен force=true.')
    }

    // 1) Delete related rows (best-effort probing)
    const cols = ['job_id', 'jobId', 'job', 'job_uuid', 'shift_id', 'shiftId']
    const results: Record<string, any> = {}

    for (const table of ['time_logs', 'job_events', 'job_workers', 'client_events', 'assignments']) {
      const r = await deleteRowsByJobId(sb, table, jobId, cols)
      if (!r.ok) throw new ApiError(500, `Failed to delete from ${table}: ${(r.error?.message || 'unknown')}`)
      results[table] = r
    }

    // 2) Delete job itself
    const delJob = await sb.from('jobs').delete().eq('id', jobId)
    if (delJob.error) throw new ApiError(500, delJob.error.message)

    return NextResponse.json({ ok: true, deleted_job_id: jobId, status: st, related: results })
  } catch (e) {
    return toErrorResponse(e)
  }
}
