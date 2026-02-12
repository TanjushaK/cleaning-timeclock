import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const url = new URL(req.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    if (!from || !to) throw new ApiError(400, 'from_to_required')

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

    q = q.gte('job_date', from).lte('job_date', to)

    const { data, error } = await q.order('job_date', { ascending: true }).order('scheduled_time', { ascending: true })
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ jobs: data ?? [] })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
