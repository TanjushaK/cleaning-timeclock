import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    // Safety: allow hard delete only for done jobs.
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id,status')
      .eq('id', id)
      .maybeSingle()

    if (jobErr) throw new ApiError(400, jobErr.message)
    if (!job) throw new ApiError(404, 'job_not_found')
    if (String((job as any).status || '') !== 'done') {
      throw new ApiError(400, 'Можно удалять только завершённые смены (status=done)')
    }

    // Best-effort cleanup of dependent tables (FK-safe).
    // If some tables do not exist in this DB revision, ignore "relation does not exist" errors.
    const bestEffortDelete = async (table: string) => {
      try {
        const { error } = await supabase.from(table).delete().eq('job_id', id)
        if (error) {
          const msg = String(error.message || '')
          if (/does not exist/i.test(msg) || /not found/i.test(msg) || /schema cache/i.test(msg)) return
          throw error
        }
      } catch (e: any) {
        const msg = String(e?.message || '')
        if (/does not exist/i.test(msg) || /not found/i.test(msg) || /schema cache/i.test(msg)) return
        throw e
      }
    }

    await bestEffortDelete('job_workers')
    await bestEffortDelete('job_events')
    await bestEffortDelete('client_events')

    const { error: tlErr } = await supabase.from('time_logs').delete().eq('job_id', id)
    if (tlErr) throw new ApiError(400, tlErr.message)

    const { error: jErr } = await supabase.from('jobs').delete().eq('id', id)
    if (jErr) throw new ApiError(400, jErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
