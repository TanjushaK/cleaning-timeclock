import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const id = params?.id
    if (!id) throw new ApiError(400, 'id_required')

    const body = await req.json().catch(() => ({}))

    const upd: Record<string, any> = {}

    if (typeof body?.name === 'string') {
      const name = body.name.trim()
      if (!name) throw new ApiError(400, 'site_name_required')
      upd.name = name
    }

    if (typeof body?.address === 'string') upd.address = body.address.trim() || null
    if (typeof body?.notes === 'string') upd.notes = body.notes.trim() || null

    if ('lat' in body) {
      const lat = body.lat === '' || body.lat == null ? null : Number(body.lat)
      if (lat != null && !Number.isFinite(lat)) throw new ApiError(400, 'lat_bad')
      upd.lat = lat
    }

    if ('lng' in body) {
      const lng = body.lng === '' || body.lng == null ? null : Number(body.lng)
      if (lng != null && !Number.isFinite(lng)) throw new ApiError(400, 'lng_bad')
      upd.lng = lng
    }

    if ('radius_m' in body) {
      const radius = body.radius_m == null || body.radius_m === '' ? 100 : Number(body.radius_m)
      if (!Number.isFinite(radius) || radius <= 0) throw new ApiError(400, 'radius_bad')
      upd.radius_m = radius
    }

    const { error } = await supabase.from('sites').update(upd).eq('id', id)
    if (error) throw new ApiError(400, error.message)

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

    const { data: jobRows, error: jErr } = await supabase.from('jobs').select('id').eq('site_id', id)
    if (jErr) throw new ApiError(400, jErr.message)

    const jobIds = (jobRows ?? []).map((r: any) => r.id).filter(Boolean)

    if (jobIds.length > 0) {
      const { error: tlErr } = await supabase.from('time_logs').delete().in('job_id', jobIds)
      if (tlErr) throw new ApiError(400, tlErr.message)

      const { error: delJobsErr } = await supabase.from('jobs').delete().eq('site_id', id)
      if (delJobsErr) throw new ApiError(400, delJobsErr.message)
    }

    const { error: delSiteErr } = await supabase.from('sites').delete().eq('id', id)
    if (delSiteErr) throw new ApiError(400, delSiteErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
