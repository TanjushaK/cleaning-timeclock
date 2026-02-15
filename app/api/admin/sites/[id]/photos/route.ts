// app/api/admin/sites/[id]/photos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

type SitePhoto = { path: string; url: string; created_at?: string }

const BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'
const SIGNED_URL_TTL = Number(process.env.SITE_PHOTOS_SIGNED_URL_TTL || '3600')
const MAX_PHOTOS = 5

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function safeStr(v: any) {
  return String(v ?? '').trim()
}

function sanitizeFilename(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\.\-_]+/gu, '_')
      .replace(/_+/g, '_')
      .slice(0, 120) || 'photo'
  )
}

function rand() {
  return Math.random().toString(36).slice(2, 10)
}

function safeExt(name: string) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '')
  const ext = m?.[1]?.toLowerCase() || 'jpg'
  return ext.slice(0, 8)
}

function moveToFront(arr: SitePhoto[], path: string) {
  const idx = arr.findIndex((x) => x.path === path)
  if (idx <= 0) return arr
  const copy = arr.slice()
  const [it] = copy.splice(idx, 1)
  copy.unshift(it)
  return copy
}

async function loadSitePhotos(siteId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabaseAdmin
    .from('sites')
    .select('photos')
    .eq('id', siteId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const raw = (data as any)?.photos
  return Array.isArray(raw) ? (raw as SitePhoto[]) : []
}

async function signOne(path: string) {
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return data?.signedUrl || ''
}

async function signPhotos(photos: SitePhoto[]): Promise<SitePhoto[]> {
  const out: SitePhoto[] = []
  for (const p of photos) {
    if (!p?.path) continue
    const url = await signOne(p.path)
    out.push({ ...p, url: url || p.url || '' })
  }
  return out
}

async function saveSite(siteId: string, photos: SitePhoto[]) {
  const { data, error } = await supabaseAdmin
    .from('sites')
    .update({ photos })
    .eq('id', siteId)
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .single()

  if (error) throw new Error(error.message)
  const site = data as any
  site.photos = await signPhotos(Array.isArray(site.photos) ? site.photos : [])
  return site
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id: siteId } = await ctx.params
    if (!siteId) return jsonError('Нет site id', 400)

    const current = await loadSitePhotos(siteId)
    if (current.length >= MAX_PHOTOS) return jsonError(`Максимум ${MAX_PHOTOS} фото`, 400)

    const fd = await req.formData()
    const file = fd.get('file')
    if (!(file instanceof File)) return jsonError('Нужен файл (file)', 400)
    if (!file.size) return jsonError('Пустой файл', 400)
    if (!file.type?.startsWith('image/')) return jsonError('Нужна картинка (image/*)', 400)

    const filename = sanitizeFilename(safeStr(file.name))
    const ext = safeExt(filename)
    const path = `sites/${siteId}/${Date.now()}-${rand()}.${ext}`

    const buf = Buffer.from(await file.arrayBuffer())

    const up = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

    if (up.error) return jsonError(up.error.message || 'Не удалось загрузить фото', 500)

    const next: SitePhoto[] = [
      ...current,
      { path, url: '', created_at: new Date().toISOString() },
    ].slice(0, MAX_PHOTOS)

    const site = await saveSite(siteId, next)
    return NextResponse.json({ site }, { status: 200 })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка загрузки', 500)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id: siteId } = await ctx.params
    if (!siteId) return jsonError('Нет site id', 400)

    const body = await req.json().catch(() => ({} as any))
    const action = safeStr(body?.action)
    const path = safeStr(body?.path)

    if (action !== 'make_primary') return jsonError('Неверное action (нужно make_primary)', 400)
    if (!path) return jsonError('Нужен path', 400)

    const current = await loadSitePhotos(siteId)
    const next = moveToFront(current, path)

    const site = await saveSite(siteId, next)
    return NextResponse.json({ site }, { status: 200 })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка обновления', 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  try {
    const { id: siteId } = await ctx.params
    if (!siteId) return jsonError('Нет site id', 400)

    const body = await req.json().catch(() => ({} as any))
    const path = safeStr(body?.path)
    if (!path) return jsonError('Нужен path', 400)

    await supabaseAdmin.storage.from(BUCKET).remove([path])

    const current = await loadSitePhotos(siteId)
    const next = current.filter((p) => p?.path !== path)

    const site = await saveSite(siteId, next)
    return NextResponse.json({ site }, { status: 200 })
  } catch (e: any) {
    return jsonError(e?.message || 'Ошибка удаления', 500)
  }
}
