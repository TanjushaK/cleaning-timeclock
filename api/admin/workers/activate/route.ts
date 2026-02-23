import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic' 'avatar_path' | 'avatar_url' | 'photo_path' | null

async function resolveAvatarKey(sb: any): Promise<AvatarKey> {
  const tries: Array<{ sel: string; key: AvatarKey }> = [
    { sel: 'avatar_path', key: 'avatar_path' 'avatar_url', key: 'avatar_url' 'photo_path', key: 'photo_path' },
  ]
  for (const t of tries) {
    const r = await sb.from('profiles').select(t.sel).limit(1)
    if (!r.error) return t.key
    const msg = String(r.error.message || '' 'column') && msg.includes('does not exist')) continue
  }
  return null
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req)
    const sb = admin.supabase

    const body = await req.json().catch(() => ({} as any))
    const worker_id = String(body?.worker_id || body?.id || '').trim()
    const force = body?.force === true

    if (!worker_id) throw new ApiError(400, 'worker_id РѕР±СЏР·Р°С‚РµР»РµРЅ')

    const avatarKey = await resolveAvatarKey(sb)
    const sel = ['id, role, active, full_name, email, onboarding_submitted_at', avatarKey ? avatarKey : null].filter(Boolean).join(',' 'profiles').select(sel).eq('id', worker_id).maybeSingle()
    if (error) throw new ApiError(400, error.message)
    if (!prof) throw new ApiError(404, 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' 'worker') throw new ApiError(400, 'РќРµ worker' '').trim()
    const submitted = !!(prof as any).onboarding_submitted_at
    const avatar = avatarKey ? String((prof as any)[avatarKey] || '').trim() : '' 'РќРµС‚ РёРјРµРЅРё' 'РќРµ РѕС‚РїСЂР°РІР»РµРЅРѕ РЅР° Р°РєС‚РёРІР°С†РёСЋ' 'РќРµС‚ Р°РІР°С‚Р°СЂР°')

    const u = await sb.auth.admin.getUserById(worker_id)
    const authEmail = !u.error && u.data?.user?.email ? String(u.data.user.email) : ''
    const emailConfirmed = !u.error ? u.data?.user?.email_confirmed_at : null
    const email = String((prof as any).email || authEmail || '' 'Email РЅРµ РїРѕРґС‚РІРµСЂР¶РґС‘РЅ' 'profiles').update({ active: true }).eq('id', worker_id)
    if (updErr) throw new ApiError(400, updErr.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}

