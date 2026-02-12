import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const worker_id = url.searchParams.get('worker_id')
    const site_id = url.searchParams.get('site_id')
    const status = url.searchParams.get('status')

    let q = supabase.from('jobs').select(
      `
      id,
      worker_id,
      site_id,
      job_date,
      scheduled_time,
      planned_minutes,
      status,
      sites ( id, name, address, lat, lng, radius_m, notes ),
      profiles:profiles!jobs_worker_id_fkey ( id, full_name, phone, avatar_url )
    `
    )

    if (from) q = q.gte('job_date', from)
    if (to) q = q.lte('job_date', to)
    if (worker_id) q = q.eq('worker_id', worker_id)
    if (site_id) q = q.eq('site_id', site_id)
    if (status) q = q.eq('status', status)

    const { data, error } = await q.order('job_date', { ascending: false })
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ jobs: data ?? [] })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => ({}))

    const worker_id = typeof body?.worker_id === 'string' ? body.worker_id.trim() : ''
    const site_id = typeof body?.site_id === 'string' ? body.site_id.trim() : ''
    const job_date = typeof body?.job_date === 'string' ? body.job_date.trim() : ''
    const scheduled_time = typeof body?.scheduled_time === 'string' ? body.scheduled_time.trim() : ''

    if (!worker_id) throw new ApiError(400, 'worker_required')
    if (!site_id) throw new ApiError(400, 'site_required')
    if (!job_date) throw new ApiError(400, 'date_required')

    const planned_minutes = body?.planned_minutes == null || body?.planned_minutes === '' ? null : Number(body.planned_minutes)
    if (planned_minutes != null && (!Number.isFinite(planned_minutes) || planned_minutes < 0)) throw new ApiError(400, 'planned_minutes_bad')

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        worker_id,
        site_id,
        job_date,
        scheduled_time: scheduled_time || null,
        planned_minutes,
        status: 'planned',
      })
      .select('id')
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
