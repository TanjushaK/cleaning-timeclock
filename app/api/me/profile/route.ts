import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser(req)

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, phone, notes')
      .eq('id', user.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile,
    })
  } catch (e: any) {
    const msg = e?.message || 'Ошибка'
    const status = /Нет токена/i.test(msg) ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
