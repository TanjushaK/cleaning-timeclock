import { NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { sendWorkerInviteEmailViaResend } from '@/lib/email/resend'
import { sendWorkerInviteSms } from '@/lib/sms/send'
import { resendOutboundReady, smsOutboundReady, workerInviteSmsEnabled } from '@/lib/server/env'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INVITE_SMS_LIMIT_PHONE_15M = 1
const INVITE_SMS_LIMIT_PHONE_24H = 3
const INVITE_SMS_LIMIT_GLOBAL_24H = 30
const WINDOW_15M_MS = 15 * 60 * 1000
const WINDOW_24H_MS = 24 * 60 * 60 * 1000

const inviteSmsByPhone = new Map<string, number[]>()
const inviteSmsGlobal: number[] = []

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

function isNlPhone(s: string): boolean {
  return /^\+31\d{8,12}$/.test(s)
}

function maskPhone(s: string): string {
  const v = String(s || '').trim()
  if (v.length < 7) return '***'
  return `${v.slice(0, 4)}…${v.slice(-3)}`
}

function pruneWindow(samples: number[], now: number, windowMs: number): number[] {
  return samples.filter((ts) => now - ts < windowMs)
}

function checkInviteSmsRateLimit(phone: string): boolean {
  const now = Date.now()
  const phoneSamples = pruneWindow(inviteSmsByPhone.get(phone) ?? [], now, WINDOW_24H_MS)
  const globalSamples = pruneWindow(inviteSmsGlobal, now, WINDOW_24H_MS)

  inviteSmsGlobal.length = 0
  inviteSmsGlobal.push(...globalSamples)

  const phoneIn15m = phoneSamples.filter((ts) => now - ts < WINDOW_15M_MS).length
  const phoneIn24h = phoneSamples.length
  const totalIn24h = globalSamples.length

  if (phoneIn15m >= INVITE_SMS_LIMIT_PHONE_15M) return false
  if (phoneIn24h >= INVITE_SMS_LIMIT_PHONE_24H) return false
  if (totalIn24h >= INVITE_SMS_LIMIT_GLOBAL_24H) return false

  const withNew = [...phoneSamples, now]
  inviteSmsByPhone.set(phone, withNew)
  inviteSmsGlobal.push(now)
  return true
}

function genTempPassword(): string {
  // 14 chars: base64url-ish, easy to dictate
  const buf = crypto.randomBytes(16)
  return buf
    .toString('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 14)
}

async function findUserIdByEmail(db: any, email: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  const needle = email.trim().toLowerCase()

  for (let i = 0; i < 60; i++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, error.message || 'listUsers failed', AdminApiErrorCode.INVITE_USER_LOOKUP_FAILED)

    const users = data?.users ?? []
    const hit = users.find((u: any) => String(u.email ?? '').toLowerCase() === needle)
    if (hit?.id) return hit.id

    if (users.length < perPage) break
    page += 1
  }
  return null
}

async function findUserIdByPhone(db: any, phone: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  const needle = phone.trim()

  for (let i = 0; i < 60; i++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, error.message || 'listUsers failed', AdminApiErrorCode.INVITE_USER_LOOKUP_FAILED)

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
    const { db, userId } = await requireAdmin(req)

    const body = await req.json().catch(() => ({} as any))

    const role = String(body?.role ?? 'worker').trim().toLowerCase()
    if (role !== 'worker' && role !== 'admin')
      throw new ApiError(400, 'role must be worker or admin', AdminApiErrorCode.INVITE_ROLE_INVALID)

    const active = role === 'worker' ? false : Boolean(body?.active ?? true)

    // Back-compat: раньше отправляли {email}. Теперь принимаем {identifier|email|phone}
    const rawIdentifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '').trim()

    if (!rawIdentifier) throw new ApiError(400, 'Email or phone required', AdminApiErrorCode.INVITE_IDENTIFIER_REQUIRED)

    const looksEmail = rawIdentifier.includes('@')
    const email = looksEmail ? rawIdentifier.toLowerCase() : null

    const phoneNorm = looksEmail ? null : normalizePhone(rawIdentifier)
    const phone = phoneNorm ? phoneNorm : null

    if (email && !isEmail(email)) throw new ApiError(400, 'Invalid email', AdminApiErrorCode.INVITE_EMAIL_INVALID)
    if (phone && !isE164(phone))
      throw new ApiError(400, 'Phone must be E.164, e.g. +31612345678', AdminApiErrorCode.INVITE_PHONE_INVALID)

    const password = String(body?.password ?? '').trim() || genTempPassword()

    let user_id: string | null = null
    let existed = false

    // Try create
    try {
      const { data, error } = await db.auth.admin.createUser({
        email: email ?? undefined,
        phone: phone ?? undefined,
        password,
        email_confirm: email ? true : undefined,
        phone_confirm: phone ? true : undefined,
        user_metadata: { temp_password: true, created_by_admin: userId },
      })

      if (error) throw new ApiError(400, error.message || 'createUser failed', AdminApiErrorCode.INVITE_USER_CREATE_FAILED)
      user_id = data?.user?.id ?? null
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (!/already|registered|exists/i.test(msg)) throw e

      // User exists — treat as "admin reset password"
      existed = true

      if (email) user_id = await findUserIdByEmail(db, email)
      if (!user_id && phone) user_id = await findUserIdByPhone(db, phone)
      if (!user_id)
        throw new ApiError(400, 'User exists but id could not be resolved', AdminApiErrorCode.INVITE_USER_LOOKUP_FAILED)

      // merge metadata (не затираем старое)
      let prevMeta: Record<string, any> = {}
      try {
        const { data: u } = await db.auth.admin.getUserById(user_id)
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

      const { error: uErr } = await db.auth.admin.updateUserById(user_id, authPatch)
      if (uErr) throw new ApiError(400, uErr.message || 'updateUser failed', AdminApiErrorCode.AUTH_USER_UPDATE_FAILED)
    }

    if (!user_id) throw new ApiError(500, 'Could not create user', AdminApiErrorCode.INVITE_USER_CREATE_FAILED)

    // Ensure profile
    const { error: pErr } = await db
      .from('profiles')
      .upsert(
        { id: user_id, role, active, email: email ?? null, phone: phone ?? null },
        { onConflict: 'id' }
      )

    if (pErr)
      throw new ApiError(500, pErr.message || 'profile upsert failed', AdminApiErrorCode.INVITE_PROFILE_FAILED)

    const login = email ?? phone ?? rawIdentifier

    const base = {
      ok: true,
      existed,
      user_id,
      role,
      active,
      login,
      password,
      temp_password: true,
    }

    if (!email) {
      if (!workerInviteSmsEnabled()) {
        console.info('[api/admin/workers/invite] sms invite disabled', {
          worker_id: user_id,
          phoneMasked: phone ? maskPhone(phone) : '***',
          smsDelivery: 'disabled',
        })
        return NextResponse.json(
          { ...base, delivery: 'skipped' as const, emailSkipReason: 'not_email', smsDelivery: 'disabled' as const },
          { status: 200 }
        )
      }

      if (!phone || !isNlPhone(phone)) {
        console.info('[api/admin/workers/invite] sms invite blocked', {
          worker_id: user_id,
          phoneMasked: phone ? maskPhone(phone) : '***',
          smsDelivery: 'blocked',
          smsBlockReason: 'unsupported_country',
        })
        return NextResponse.json(
          {
            ...base,
            delivery: 'skipped' as const,
            emailSkipReason: 'not_email',
            smsDelivery: 'blocked' as const,
            smsBlockReason: 'unsupported_country' as const,
          },
          { status: 200 }
        )
      }

      if (!checkInviteSmsRateLimit(phone)) {
        console.info('[api/admin/workers/invite] sms invite blocked', {
          worker_id: user_id,
          phoneMasked: maskPhone(phone),
          smsDelivery: 'blocked',
          smsBlockReason: 'rate_limited',
        })
        return NextResponse.json(
          {
            ...base,
            delivery: 'skipped' as const,
            emailSkipReason: 'not_email',
            smsDelivery: 'blocked' as const,
            smsBlockReason: 'rate_limited' as const,
          },
          { status: 200 }
        )
      }

      if (!smsOutboundReady()) {
        console.warn('[api/admin/workers/invite] sms invite failed: outbound not ready', {
          worker_id: user_id,
          phoneMasked: maskPhone(phone),
          smsDelivery: 'failed',
        })
        return NextResponse.json(
          {
            ...base,
            delivery: 'skipped' as const,
            emailSkipReason: 'not_email',
            smsDelivery: 'failed' as const,
            smsError: 'SMS outbound not configured (SMS_SEND_ENABLED, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)',
          },
          { status: 200 }
        )
      }

      try {
        await sendWorkerInviteSms(phone, login, password)
        console.info('[api/admin/workers/invite] sms invite sent', {
          worker_id: user_id,
          phoneMasked: maskPhone(phone),
          smsDelivery: 'sent',
        })
        return NextResponse.json(
          { ...base, delivery: 'skipped' as const, emailSkipReason: 'not_email', smsDelivery: 'sent' as const },
          { status: 200 }
        )
      } catch (e: unknown) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
        console.error('[api/admin/workers/invite] sms invite failed', {
          worker_id: user_id,
          phoneMasked: maskPhone(phone),
          smsDelivery: 'failed',
        })
        return NextResponse.json(
          {
            ...base,
            delivery: 'skipped' as const,
            emailSkipReason: 'not_email',
            smsDelivery: 'failed' as const,
            smsError: msg,
          },
          { status: 200 }
        )
      }

    }

    if (!resendOutboundReady()) {
      console.warn('[api/admin/workers/invite] email not sent: resend outbound not ready')
      return NextResponse.json(
        {
          ...base,
          delivery: 'failed' as const,
          emailError: 'Email outbound not configured (EMAIL_SEND_ENABLED, RESEND_API_KEY, MAIL_FROM)',
        },
        { status: 200 }
      )
    }

    try {
      await sendWorkerInviteEmailViaResend(email, login, password)
      return NextResponse.json({ ...base, delivery: 'sent' as const }, { status: 200 })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const safe = msg.slice(0, 500)
      console.error('[api/admin/workers/invite] email delivery failed', {
        user_id,
        err: safe.slice(0, 300),
      })
      return NextResponse.json(
        {
          ...base,
          delivery: 'failed' as const,
          emailError: safe,
        },
        { status: 200 }
      )
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
