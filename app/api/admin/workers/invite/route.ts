import { NextResponse } from 'next/server' '@/lib/supabase-server' 'crypto' 'nodejs' 'force-dynamic'

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function normalizePhone(raw: string): string {
  const p = String(raw || '').trim().replace(/[\s()\-]/g, '' '' '+')) return p
  return p
}

function isE164(s: string): boolean {
  return /^\+\d{8,15}$/.test(s)
}

function genTempPassword(): string {
  // 14 chars: base64url-ish, easy to РґРёРєС‚РѕРІР°С‚СЊ
  const buf = crypto.randomBytes(16)
  return buf
    .toString('base64' '')
    .slice(0, 14)
}

async function findUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  const needle = email.trim().toLowerCase()

  for (let i = 0; i < 60; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, `РќРµ СЃРјРѕРі РїСЂРѕС‡РёС‚Р°С‚СЊ auth users: ${error.message}`)

    const users = data?.users ?? []
    const hit = users.find((u: any) => String(u.email ?? '').toLowerCase() === needle)
    if (hit?.id) return hit.id

    if (users.length < perPage) break
    page += 1
  }
  return null
}

async function findUserIdByPhone(supabase: any, phone: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  const needle = phone.trim()

  for (let i = 0; i < 60; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, `РќРµ СЃРјРѕРі РїСЂРѕС‡РёС‚Р°С‚СЊ auth users: ${error.message}`)

    const users = data?.users ?? []
    const hit = users.find((u: any) => String((u as any).phone ?? '').trim() === needle)
    if (hit?.id) return hit.id

    if (users.length < perPage) break
    page += 1
  }
  return null
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireAdmin(req)

    const body = await req.json().catch(() => ({} as any))

    const role = String(body?.role ?? 'worker' 'worker' && role !== 'admin') throw new ApiError(400, 'role РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ worker РёР»Рё admin' 'worker' ? false : Boolean(body?.active ?? true)

    // Back-compat: СЂР°РЅСЊС€Рµ РѕС‚РїСЂР°РІР»СЏР»Рё {email}. РўРµРїРµСЂСЊ РїСЂРёРЅРёРјР°РµРј {identifier|email|phone}
    const rawIdentifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '' 'РќСѓР¶РµРЅ email РёР»Рё С‚РµР»РµС„РѕРЅ' '@')
    const email = looksEmail ? rawIdentifier.toLowerCase() : null

    const phoneNorm = looksEmail ? null : normalizePhone(rawIdentifier)
    const phone = phoneNorm ? phoneNorm : null

    if (email && !isEmail(email)) throw new ApiError(400, 'РќРµРІРµСЂРЅС‹Р№ email' 'РўРµР»РµС„РѕРЅ РЅСѓР¶РµРЅ РІ С„РѕСЂРјР°С‚Рµ E.164, РЅР°РїСЂРёРјРµСЂ +31612345678' '').trim() || genTempPassword()

    let user_id: string | null = null
    let existed = false

    // Try create
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: email ?? undefined,
        phone: phone ?? undefined,
        password,
        email_confirm: email ? true : undefined,
        phone_confirm: phone ? true : undefined,
        user_metadata: { temp_password: true, created_by_admin: userId },
      })

      if (error) throw new ApiError(400, error.message)
      user_id = data?.user?.id ?? null
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (!/already|registered|exists/i.test(msg)) throw e

      // User exists вЂ” treat as "admin reset password"
      existed = true

      if (email) user_id = await findUserIdByEmail(supabase, email)
      if (!user_id && phone) user_id = await findUserIdByPhone(supabase, phone)
      if (!user_id) throw new ApiError(400, 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚, РЅРѕ РЅРµ СѓРґР°Р»РѕСЃСЊ РЅР°Р№С‚Рё РµРіРѕ id')

      // merge metadata (РЅРµ Р·Р°С‚РёСЂР°РµРј СЃС‚Р°СЂРѕРµ)
      let prevMeta: Record<string, any> = {}
      try {
        const { data: u } = await supabase.auth.admin.getUserById(user_id)
        prevMeta = (((u as any)?.user as any)?.user_metadata ?? {}) as Record<string, any>
      } catch {
        // ignore
      }

      const nextMeta = {
        ...prevMeta,
        temp_password: true,
        reset_by_admin: userId,
        reset_at: new Date().toISOString(),
      }

      const authPatch: any = {
        password,
        user_metadata: nextMeta,
      }
      if (email) {
        authPatch.email = email
        authPatch.email_confirm = true
      }
      if (phone) {
        authPatch.phone = phone
        authPatch.phone_confirm = true
      }

      const { error: uErr } = await supabase.auth.admin.updateUserById(user_id, authPatch)
      if (uErr) throw new ApiError(400, uErr.message)
    }

    if (!user_id) throw new ApiError(500, 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ')

    // Ensure profile
    const { error: pErr } = await supabase
      .from('profiles')
      .upsert(
        { id: user_id, role, active, email: email ?? null, phone: phone ?? null },
        { onConflict: 'id' }
      )

    if (pErr) throw new ApiError(500, `РќРµ СЃРјРѕРі СЃРѕР·РґР°С‚СЊ/РѕР±РЅРѕРІРёС‚СЊ profile: ${pErr.message}`)

    const login = email ?? phone ?? rawIdentifier

    return NextResponse.json(
      {
        ok: true,
        existed,
        user_id,
        role,
        active,
        login,
        password,
        temp_password: true,
      },
      { status: 200 }
    )
  } catch (e) {
    return toErrorResponse(e)
  }
}

