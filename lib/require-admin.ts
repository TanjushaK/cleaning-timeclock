import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; res: NextResponse }

function getBearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m?.[1] || null
}

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const token = getBearerToken(req)
  if (!token) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  const userId = userData?.user?.id || null
  if (userErr || !userId) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profErr) {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  if ((profile?.role || '') !== 'admin') {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, userId }
}
