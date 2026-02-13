import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function jsonErr(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('id', { ascending: false })

    if (error) return jsonErr(500, error.message)
    return NextResponse.json({ sites: data || [] }, { status: 200 })
  } catch (e: any) {
    if (e instanceof ApiError) return jsonErr(e.status, e.message)
    return jsonErr(500, e?.message || 'Внутренняя ошибка')
  }
}
