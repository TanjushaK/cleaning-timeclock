import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data, error } = await supabase
      .from('jobs')
      .select('*')

    if (error) throw new ApiError(500, `Не смог прочитать jobs: ${error.message}`)

    return NextResponse.json({ jobs: data ?? [] }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
