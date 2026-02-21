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
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // если вход по телефону/новый user — профиля может не быть
    if (!profile) {
      const phone = (user as any).phone ? String((user as any).phone) : null
      const { data: created, error: cErr } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          role: 'worker',
          active: true,
          full_name: null,
          phone,
          notes: '',
        })
        .select('id, role, active, full_name, phone, notes')
        .single()

      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })

      return NextResponse.json({
        user: { id: user.id, email: user.email ?? null },
        profile: created,
      })
    }

    // если профиль есть, но phone пустой — докинем из auth.user
    const uPhone = (user as any).phone ? String((user as any).phone) : null
    if (uPhone && !profile.phone) {
      await supabase.from('profiles').update({ phone: uPhone }).eq('id', user.id)
      ;(profile as any).phone = uPhone
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
      profile,
    })
  } catch (e: any) {
    const msg = e?.message || 'Ошибка'
    const status = /Нет токена/i.test(msg) ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
