import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser(req)

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (!profile) {
      const phone = (user as any).phone ? String((user as any).phone) : null
      const email = user.email ? String(user.email) : null

      const { data: created, error: cErr } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          role: 'worker',
          active: false,
          full_name: null,
          phone,
          email,
          avatar_path: null,
          notes: '',
          onboarding_submitted_at: null,
        })
        .select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at')
        .single()

      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: (user as any).phone ?? null,
          email_confirmed_at: (user as any).email_confirmed_at ?? null,
        },
        profile: created,
      })
    }

    const uPhone = (user as any).phone ? String((user as any).phone) : null
    const uEmail = user.email ? String(user.email) : null

    const patch: any = {}
    if (uPhone && !profile.phone) patch.phone = uPhone
    if (uEmail && !profile.email) patch.email = uEmail

    if (Object.keys(patch).length) {
      await supabase.from('profiles').update(patch).eq('id', user.id)
      Object.assign(profile as any, patch)
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? null,
        phone: (user as any).phone ?? null,
        email_confirmed_at: (user as any).email_confirmed_at ?? null,
      },
      profile,
    })
  } catch (e: any) {
    const msg = e?.message || 'Ошибка'
    const status = /Нет токена/i.test(msg) ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
