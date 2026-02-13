import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    // Доп. привязка через job_workers (если используете many-to-many)
    const { data: jw, error: jwErr } = await supabase.from('job_workers').select('job_id').eq('worker_id', userId)
    if (jwErr) throw new ApiError(400, jwErr.message)

    const extraJobIds = (jw || [])
      .map((r: any) => r?.job_id)
      .filter((v: any) => typeof v === 'string' && v.length > 0) as string[]

    let q = supabase
      .from('jobs')
      .select('id, title, status, job_date, scheduled_time, site_id, worker_id, site:sites(id, name, lat, lng, radius)')
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (extraJobIds.length > 0) {
      q = q.or(`worker_id.eq.${userId},id.in.(${extraJobIds.join(',')})`)
    } else {
      q = q.eq('worker_id', userId)
    }

    const { data: jobs, error } = await q
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ jobs: jobs || [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
