import { NextResponse } from 'next/server'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    const { data: prof, error } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, avatar_path, onboarding_submitted_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw new ApiError(400, error.message, AppApiErrorCodes.PROFILE_LOAD_FAILED)
    if (!prof) throw new ApiError(404, 'Profile not found', AppApiErrorCodes.PROFILE_NOT_FOUND)

    const full = String((prof as any).full_name || '').trim()
    const avatar = String((prof as any).avatar_path || '').trim()

    if (!full) throw new ApiError(400, 'Name required', AppApiErrorCodes.PROFILE_SUBMIT_NAME_REQUIRED)
    if (!avatar) throw new ApiError(400, 'Avatar required', AppApiErrorCodes.PROFILE_SUBMIT_AVATAR_REQUIRED)

    const patch: any = {
      active: false,
      onboarding_submitted_at: new Date().toISOString(),
    }

    const r = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('id, role, active, full_name, phone, email, avatar_path, notes, onboarding_submitted_at')
      .single()

    if (r.error) throw new ApiError(400, r.error.message, AppApiErrorCodes.PROFILE_UPDATE_FAILED)

    return NextResponse.json({ ok: true, profile: r.data })
  } catch (e) {
    return toErrorResponse(e)
  }
}
