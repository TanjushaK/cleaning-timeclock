import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const id = params?.id
    if (!id) throw new ApiError(400, 'id_required')

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
