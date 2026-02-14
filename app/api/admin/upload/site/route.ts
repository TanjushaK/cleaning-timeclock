import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const form = await req.formData()
    const siteId = String(form.get('site_id') || '').trim()
    const file = form.get('file')

    if (!siteId) throw new ApiError(400, 'site_id обязателен')
    if (!(file instanceof File)) throw new ApiError(400, 'Нужен файл (file)')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const filename = safeName(file.name || 'site')
    const path = `${siteId}/${Date.now()}-${filename}`

    const { error: upErr } = await supabase.storage.from('sites').upload(path, bytes, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    })
    if (upErr) throw new ApiError(500, upErr.message)

    const { data: pub } = supabase.storage.from('sites').getPublicUrl(path)
    const url = pub?.publicUrl
    if (!url) throw new ApiError(500, 'Не удалось получить public URL')

    const { error: updErr } = await supabase.from('sites').update({ photo_url: url }).eq('id', siteId)
    if (updErr) throw new ApiError(400, updErr.message)

    return NextResponse.json({ ok: true, url })
  } catch (err) {
    return toErrorResponse(err)
  }
}
