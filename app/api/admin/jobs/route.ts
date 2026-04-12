import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data, error } = await supabase
      .from('jobs')
      .select('*')

    if (error) throw new ApiError(500, error.message || 'Could not load jobs', AdminApiErrorCode.JOBS_LOAD_FAILED)

    return NextResponse.json({ jobs: data ?? [] }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
