import { NextRequest, NextResponse } from 'next/server' '@/lib/supabase-server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const { error: tlErr } = await supabase.from('time_logs').delete().eq('job_id', id)
    if (tlErr) throw new ApiError(400, tlErr.message)

    const { error: jErr } = await supabase.from('jobs').delete().eq('id', id)
    if (jErr) throw new ApiError(400, jErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

