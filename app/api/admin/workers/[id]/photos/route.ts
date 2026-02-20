import { NextRequest, NextResponse } from 'next/server'

import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }

// В проекте мы используем общий bucket для фото объектов/работников.
// Можно переопределить через env WORKER_PHOTOS_BUCKET.
const BUCKET = process.env.WORKER_PHOTOS_BUCKET || 'site-photos'

function getSignedTtlSeconds(): number {
  const v = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600')
  if (!Number.isFinite(v) || v <= 0) return 3600
  return Math.min(v, 60 * 60 * 24 * 7) // max 7 days
}

function withCookieBearer(req: NextRequest): Headers {
  const headers = new Headers(req.headers)

  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const hasBearer = /^Bearer\s+.+/i.test(auth)

  if (!hasBearer) {
    const cookieToken = req.cookies.get('ct_access_token')?.value?.trim()
    if (cookieToken) headers.set('authorization', `Bearer ${cookieToken}`)
  }

  return headers
}

function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

type Ctx = { params: Promise<{ id: string }> }

function prefix(workerId: string): string {
  return `workers/${workerId}`
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id: workerId } = await ctx.params

    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)

    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const pref = prefix(workerId)

    // list all objects under prefix workers/<id>/
    const { data: listed, error: listErr } = await admin.supabase.storage
      .from(BUCKET)
      .list(pref, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

    if (listErr) throw new ApiError(500, listErr.message)

    const ttl = getSignedTtlSeconds()

    const items: WorkerPhoto[] = []
    for (const it of listed || []) {
      if (!it.name) continue
      const path = `${pref}/${it.name}`

      const { data: signed, error: signErr } = await admin.supabase.storage.from(BUCKET).createSignedUrl(path, ttl)

      if (signErr) {
        // не валим весь список — просто без url
        items.push({ path, created_at: (it as any)?.created_at ?? null })
        continue
      }

      items.push({ path, url: signed?.signedUrl, created_at: (it as any)?.created_at ?? null })
    }

    return NextResponse.json({ photos: items }, { status: 200 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id: workerId } = await ctx.params

    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)

    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError(400, 'Нет файла (formData file)')

    if (file.size <= 0) throw new ApiError(400, 'Файл пустой')

    const maxBytes = Number(process.env.WORKER_PHOTOS_MAX_BYTES || String(8 * 1024 * 1024))
    if (Number.isFinite(maxBytes) && file.size > maxBytes) {
      throw new ApiError(413, `Файл слишком большой (> ${maxBytes} bytes)`)
    }

    const filename = safeName(`${Date.now()}_${file.name || 'photo'}`)
    const path = `${prefix(workerId)}/${filename}`

    const buf = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await admin.supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message)

    const ttl = getSignedTtlSeconds()
    const { data: signed, error: signErr } = await admin.supabase.storage.from(BUCKET).createSignedUrl(path, ttl)
    if (signErr) throw new ApiError(500, signErr.message)

    return NextResponse.json({ path, url: signed?.signedUrl }, { status: 200 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
