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
    const workerId = String(form.get('worker_id') || '').trim()
    const file = form.get('file')

    if (!workerId) throw new ApiError(400, 'worker_id обязателен')
    if (!(file instanceof File)) throw new ApiError(400, 'Нужен файл (file)')

    const bytes = new Uint8Array(await file.arrayBuffer())
    const filename = safeName(file.name || 'avatar')
    const path = `${workerId}/${Date.now()}-${filename}`

    const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    })
    if (upErr) throw new ApiError(500, upErr.message)

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = pub?.publicUrl
    if (!url) throw new ApiError(500, 'Не удалось получить public URL')

    const { error: updErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', workerId)
    if (updErr) throw new ApiError(400, updErr.message)

    return NextResponse.json({ ok: true, url })
  } catch (err) {
    return toErrorResponse(err)
  }
}
