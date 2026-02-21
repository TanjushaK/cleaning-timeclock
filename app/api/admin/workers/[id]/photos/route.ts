import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

const RAW_BUCKET = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'
const { bucket: BUCKET, prefix: BUCKET_PREFIX } = parseBucketRef(RAW_BUCKET, 'site-photos')

function getSignedTtlSeconds(): number {
  const v = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600')
  if (!Number.isFinite(v) || v <= 0) return 3600
  return Math.min(v, 60 * 60 * 24 * 7)
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

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function prefix(workerId: string): string {
  const core = `workers/${workerId}`
  return BUCKET_PREFIX ? joinPath(BUCKET_PREFIX, core) : core
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { id: workerId } = await ctx.params

    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)

    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const pref = prefix(workerId)

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
    if (!file || !(file instanceof File)) throw new ApiError(400, 'file_required')

    const pref = prefix(workerId)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    const filename = `${Date.now()}_${base}.${ext}`
    const path = `${pref}/${filename}`

    const buf = new Uint8Array(await file.arrayBuffer())

    const { error: upErr } = await admin.supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message)

    const ttl = getSignedTtlSeconds()
    const { data: signed, error: signErr } = await admin.supabase.storage.from(BUCKET).createSignedUrl(path, ttl)
    if (signErr) throw new ApiError(500, signErr.message)

    return NextResponse.json({ ok: true, photo: { path, url: signed?.signedUrl } }, { status: 200 })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id: workerId } = await ctx.params

    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)

    if (!workerId) throw new ApiError(400, 'Missing worker id')

    const body = await req.json().catch(() => null)
    const path = String(body?.path || '')
    if (!path) throw new ApiError(400, 'path_required')

    const { error: delErr } = await admin.supabase.storage.from(BUCKET).remove([path])
    if (delErr) throw new ApiError(500, delErr.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
