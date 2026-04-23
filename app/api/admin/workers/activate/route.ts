import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path' | null

async function resolveAvatarKey(sb: any): Promise<AvatarKey> {
  const tries: Array<{ sel: string; key: AvatarKey }> = [
    { sel: 'avatar_path', key: 'avatar_path' },
    { sel: 'avatar_url', key: 'avatar_url' },
    { sel: 'photo_path', key: 'photo_path' },
  ]
  for (const t of tries) {
    const r = await sb.from('profiles').select(t.sel).limit(1)
    if (!r.error) return t.key
    const msg = String(r.error.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  return null
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req)
    const sb = admin.db

    const body = await req.json().catch(() => ({} as any))
    const worker_id = String(body?.worker_id || body?.id || '').trim()
    const force = body?.force === true

    if (!worker_id) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.ACTIVATE_ID_REQUIRED)

    const avatarKey = await resolveAvatarKey(sb)
    const sel = ['id, role, active, full_name, email, onboarding_submitted_at', avatarKey ? avatarKey : null].filter(Boolean).join(',')

    const { data: prof, error } = await sb.from('profiles').select(sel).eq('id', worker_id).maybeSingle()
    if (error) throw new ApiError(400, error.message || 'Query failed', AdminApiErrorCode.DB_ERROR)
    if (!prof) throw new ApiError(404, 'Profile not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
    if (String((prof as any).role) !== 'worker') throw new ApiError(400, 'Not a worker profile', AdminApiErrorCode.ACTIVATE_NOT_WORKER)

    const full = String((prof as any).full_name || '').trim()
    const submitted = !!(prof as any).onboarding_submitted_at
    const avatar = avatarKey ? String((prof as any)[avatarKey] || '').trim() : ''

    if (!full && !force) throw new ApiError(400, 'Activation requirements not met', AdminApiErrorCode.ACTIVATE_REQUIREMENTS_NOT_MET)
    if (!submitted && !force) throw new ApiError(400, 'Activation requirements not met', AdminApiErrorCode.ACTIVATE_REQUIREMENTS_NOT_MET)
    if (!avatar && !force) throw new ApiError(400, 'Activation requirements not met', AdminApiErrorCode.ACTIVATE_REQUIREMENTS_NOT_MET)

    const u = await sb.auth.admin.getUserById(worker_id)
    const authEmail = !u.error && u.data?.user?.email ? String(u.data.user.email) : ''
    const emailConfirmed = !u.error ? u.data?.user?.email_confirmed_at : null
    const email = String((prof as any).email || authEmail || '').trim()

    if (email && !emailConfirmed && !force)
      throw new ApiError(400, 'Email is not confirmed', AdminApiErrorCode.ACTIVATE_EMAIL_UNCONFIRMED)

    const { error: updErr } = await sb.from('profiles').update({ active: true }).eq('id', worker_id)
    if (updErr) throw new ApiError(400, updErr.message || 'Update failed', AdminApiErrorCode.PROFILE_UPDATE_FAILED)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
