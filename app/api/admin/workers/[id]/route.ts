import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const id = params?.id
    if (!id) throw new ApiError(400, 'id_required')

    const body = await req.json().catch(() => ({}))

    const updProfile: Record<string, any> = {}
    if (typeof body?.active === 'boolean') updProfile.active = body.active
    if (typeof body?.full_name === 'string') updProfile.full_name = body.full_name.trim() || null
    if (typeof body?.phone === 'string') updProfile.phone = body.phone.trim() || null

    if (Object.keys(updProfile).length > 0) {
      const { error: pErr } = await supabase.from('profiles').update(updProfile).eq('id', id)
      if (pErr) throw new ApiError(400, pErr.message)
    }

    if (typeof body?.password === 'string') {
      const password = body.password.trim()
      if (password.length < 6) throw new ApiError(400, 'password_min_6')

      const { error: uErr } = await supabase.auth.admin.updateUserById(id, { password })
      if (uErr) throw new ApiError(400, uErr.message)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const id = params?.id
    if (!id) throw new ApiError(400, 'id_required')

    const { data: jobRows, error: jErr } = await supabase.from('jobs').select('id').eq('worker_id', id)
    if (jErr) throw new ApiError(400, jErr.message)

    const jobIds = (jobRows ?? []).map((r: any) => r.id).filter(Boolean)

    if (jobIds.length > 0) {
      const { error: tlErr } = await supabase.from('time_logs').delete().in('job_id', jobIds)
      if (tlErr) throw new ApiError(400, tlErr.message)
    }

    const { error: delJobsErr } = await supabase.from('jobs').delete().eq('worker_id', id)
    if (delJobsErr) throw new ApiError(400, delJobsErr.message)

    const { error: delProfileErr } = await supabase.from('profiles').delete().eq('id', id)
    if (delProfileErr) throw new ApiError(400, delProfileErr.message)

    const { error: delAuthErr } = await supabase.auth.admin.deleteUser(id)
    if (delAuthErr) throw new ApiError(400, delAuthErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
