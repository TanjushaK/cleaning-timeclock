import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'

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

    if (error) throw new ApiError(400, error.message, AppApiErrorCodes.PROFILE_LOAD_FAILED)

    const uPhone = (user as any).phone ? String((user as any).phone) : null
    const uEmail = user.email ? String(user.email) : null

    const rawTemp = (user as any)?.user_metadata?.temp_password; const tempPassword = rawTemp === true || rawTemp === 'true' || rawTemp === 1 || rawTemp === '1'

    if (!profile) {
      const { data: created, error: cErr } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          role: 'worker',
          active: false,
          full_name: null,
          phone: uPhone,
          email: uEmail,
          avatar_path: null,
          notes: '',
          onboarding_submitted_at: null,
        })
        .select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at')
        .single()

      if (cErr) throw new ApiError(400, cErr.message, AppApiErrorCodes.PROFILE_CREATE_FAILED)

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email ?? null,
          phone: (user as any).phone ?? null,
          email_confirmed_at: (user as any).email_confirmed_at ?? null,
          temp_password: tempPassword,
        },
        profile: created,
      })
    }

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
        temp_password: tempPassword,
      },
      profile,
    })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}


