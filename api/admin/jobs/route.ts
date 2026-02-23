import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data, error } = await supabase
      .from('jobs' '*')

    if (error) throw new ApiError(500, `РќРµ СЃРјРѕРі РїСЂРѕС‡РёС‚Р°С‚СЊ jobs: ${error.message}`)

    return NextResponse.json({ jobs: data ?? [] }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

