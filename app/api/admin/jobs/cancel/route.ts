import { NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse } from '@/lib/supabase-server'

function jsonError(status: number, message: string, details?: any) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status }
  )
}

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
): Promise<{ ok: true; used?: string } | { ok: false; error: SupabaseErr } | { ok: true; skipped: true }>{
  // Try each possible column name; ignore "column does not exist" errors.
  // Supabase/Postgres error code for undefined column is 42703.
  for (const col of columns) {
    const res = await supabase.from(table).delete().eq(col, jobId)
    if (!res?.error) return { ok: true, used: col }

    const err = res.error as SupabaseErr
    if (err?.code === '42703') {
      // Column doesn't exist in this schema; try next.
      continue
    }

    // Table might not exist (42P01) or other error; stop.
    return { ok: false, error: err }
  }

  // None of the columns exist => nothing we can delete here.
  return { ok: true, skipped: true }
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const jobId: string | undefined =
      body?.job_id ?? body?.jobId ?? body?.id ?? body?.job?.id

    if (!jobId || typeof jobId !== 'string') {
      return jsonError(400, 'Missing job_id')
    }

    // 0) Load job (optional rule: only allow delete if planned)
    const jobRes = await guard.supabase
      .from('jobs')
      .select('id,status')
      .eq('id', jobId)
      .maybeSingle()

    if (jobRes.error) {
      return jsonError(500, 'Failed to load job', jobRes.error)
    }
    if (!jobRes.data) {
      return jsonError(404, 'Job not found')
    }

    // Optional strictness: don't allow deleting running/done shifts.
    // If you want "admin can delete anything" — just delete this block.
    if (jobRes.data.status === 'in_progress' || jobRes.data.status === 'done') {
      return jsonError(409, 'Cannot cancel (delete) job that is in progress or done')
    }

    // 1) Delete join rows (assignments) with schema-probing (no DB migrations).
    // Your DB might use a different FK column name; we try common variants.
    const delAssign = await deleteRowsByJobId(guard.supabase, 'assignments', jobId, [
      'job_id',
      'jobId',
      'job',
      'job_uuid',
      'shift_id',
      'shiftId'
    ])

    if (!delAssign.ok) {
      return jsonError(500, 'Failed to delete assignments for job', delAssign.error)
    }

    // 2) Delete the job itself
    const delJob = await guard.supabase.from('jobs').delete().eq('id', jobId)
    if (delJob.error) {
      return jsonError(500, 'Failed to delete job', delJob.error)
    }

    return NextResponse.json({ ok: true, deleted_job_id: jobId })
  } catch (err) {
    return toErrorResponse(err)
  }
}
