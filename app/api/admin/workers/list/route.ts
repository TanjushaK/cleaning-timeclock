import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, active, first_name, last_name, address, notes, avatar_url, phone')
      .neq('role', 'admin')
      .order('full_name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ workers: data ?? [] }, { status: 200 })
  } catch (e: any) {
    const status = e?.status || 500
    return NextResponse.json({ error: e?.message || 'Ошибка' }, { status })
  }
}
