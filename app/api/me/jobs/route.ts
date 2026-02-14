import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select(
        'id, title, status, job_date, scheduled_time, planned_minutes, site_id, worker_id, site:sites(id, name, lat, lng, radius)'
      )
      .eq('worker_id', userId)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ jobs: jobs || [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
