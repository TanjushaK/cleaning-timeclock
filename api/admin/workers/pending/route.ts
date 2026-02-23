import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path' | null

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  return { bucket }
}

function isUrl(s: string) {
  return /^https?:\/\//i.test(String(s || ''))
}

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

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    const sb = admin.supabase

    const avatarKey = await resolveAvatarKey(sb)

    const sel = [
      'id',
      'role',
      'active',
      'full_name',
      'phone',
      'email',
      'onboarding_submitted_at',
      avatarKey ? avatarKey : null,
    ]
      .filter(Boolean)
      .join(',')

    const { data, error } = await sb
      .from('profiles')
      .select(sel)
      .eq('role', 'worker')
      .eq('active', false)
      .order('onboarding_submitted_at', { ascending: false, nullsFirst: false })

    if (error) throw new ApiError(500, error.message)

    const rows = (data || []).map((p: any) => {
      const avatar_ref = avatarKey ? (p[avatarKey] ? String(p[avatarKey]) : null) : null
      return {
        id: String(p.id),
        full_name: p.full_name ?? null,
        phone: p.phone ?? null,
        email: p.email ?? null,
        onboarding_submitted_at: p.onboarding_submitted_at ?? null,
        avatar_ref,
      }
    })

    // email_confirmed_at из auth.users
    const authById = new Map<string, any>()
    for (const r of rows) {
      const u = await sb.auth.admin.getUserById(r.id)
      if (!u.error && u.data?.user) authById.set(r.id, u.data.user)
    }

    const RAW_WORKER_BUCKET = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'
    const { bucket: WORKER_BUCKET } = parseBucketRef(RAW_WORKER_BUCKET, 'site-photos')
    const ttl = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600') || 3600

    const needSign = rows
      .map((r) => r.avatar_ref)
      .filter((x) => x && !isUrl(x)) as string[]

    const signedByPath = new Map<string, string>()
    const uniq = Array.from(new Set(needSign))
    if (uniq.length) {
      const { data: signed, error: signErr } = await sb.storage.from(WORKER_BUCKET).createSignedUrls(uniq, ttl)
      if (!signErr && Array.isArray(signed)) {
        for (const s of signed as any[]) {
          const p = s?.path ? String(s.path) : ''
          const u = s?.signedUrl ? String(s.signedUrl) : ''
          if (p && u) signedByPath.set(p, u)
        }
      }
    }

    const pending = rows.map((r) => {
      const au = authById.get(r.id)
      const email_confirmed_at = au?.email_confirmed_at ?? null
      const auth_email = au?.email ?? null
      const auth_phone = au?.phone ?? null

      const avatar_url = r.avatar_ref
        ? isUrl(r.avatar_ref)
          ? r.avatar_ref
          : signedByPath.get(r.avatar_ref) || null
        : null

      const can_activate =
        !!String(r.full_name || '').trim() &&
        !!String(r.avatar_ref || '').trim() &&
        (String(r.email || auth_email || '').trim() ? !!email_confirmed_at : true) &&
        !!r.onboarding_submitted_at

      return {
        id: r.id,
        full_name: r.full_name,
        phone: r.phone || auth_phone,
        email: r.email || auth_email,
        email_confirmed_at,
        onboarding_submitted_at: r.onboarding_submitted_at,
        avatar_url,
        can_activate,
      }
    })

    return NextResponse.json({ pending }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
