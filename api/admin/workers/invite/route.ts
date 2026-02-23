import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function normalizePhone(raw: string): string {
  const p = String(raw || '').trim().replace(/[\s()\-]/g, '')
  if (!p) return ''
  if (!p.startsWith('+')) return p
  return p
}

function isE164(s: string): boolean {
  return /^\+\d{8,15}$/.test(s)
}

function genTempPassword(): string {
  // 14 chars: base64url-ish, easy to диктовать
  const buf = crypto.randomBytes(16)
  return buf
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 14)
}

async function findUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  const needle = email.trim().toLowerCase()

  for (let i = 0; i < 60; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, `Не смог прочитать auth users: ${error.message}`)

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
    if (error) throw new ApiError(500, `Не смог прочитать auth users: ${error.message}`)

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

    const role = String(body?.role ?? 'worker').trim().toLowerCase()
    if (role !== 'worker' && role !== 'admin') throw new ApiError(400, 'role должен быть worker или admin')

    const active = role === 'worker' ? false : Boolean(body?.active ?? true)

    // Back-compat: раньше отправляли {email}. Теперь принимаем {identifier|email|phone}
    const rawIdentifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '').trim()

    if (!rawIdentifier) throw new ApiError(400, 'Нужен email или телефон')

    const looksEmail = rawIdentifier.includes('@')
    const email = looksEmail ? rawIdentifier.toLowerCase() : null

    const phoneNorm = looksEmail ? null : normalizePhone(rawIdentifier)
    const phone = phoneNorm ? phoneNorm : null

    if (email && !isEmail(email)) throw new ApiError(400, 'Неверный email')
    if (phone && !isE164(phone)) throw new ApiError(400, 'Телефон нужен в формате E.164, например +31612345678')

    const password = String(body?.password ?? '').trim() || genTempPassword()

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

      // User exists — treat as "admin reset password"
      existed = true

      if (email) user_id = await findUserIdByEmail(supabase, email)
      if (!user_id && phone) user_id = await findUserIdByPhone(supabase, phone)
      if (!user_id) throw new ApiError(400, 'Пользователь уже существует, но не удалось найти его id')

      const authPatch: any = {
        password,
        data: { temp_password: true, reset_by_admin: userId, reset_at: new Date().toISOString() },
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

    if (!user_id) throw new ApiError(500, 'Не удалось создать пользователя')

    // Ensure profile
    const { error: pErr } = await supabase
      .from('profiles')
      .upsert(
        { id: user_id, role, active, email: email ?? null, phone: phone ?? null },
        { onConflict: 'id' }
      )

    if (pErr) throw new ApiError(500, `Не смог создать/обновить profile: ${pErr.message}`)

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
