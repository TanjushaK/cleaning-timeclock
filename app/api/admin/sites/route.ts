import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function assertAdmin(req: NextRequest) {
  const token = bearer(req)
  if (!token) return NextResponse.json({ error: 'No bearer token' }, { status: 401 })

  const supabase = createClient(envOrThrow('NEXT_PUBLIC_SUPABASE_URL'), envOrThrow('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userRes?.user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .maybeSingle()
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 })
  if (!prof || prof.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return supabase
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await assertAdmin(req)
    if (supabase instanceof NextResponse) return supabase

    const body = await req.json().catch(() => null)
    const name = String(body?.name || '').trim()
    const address = body?.address == null ? null : String(body.address).trim()
    const notes = body?.notes == null ? null : String(body.notes).trim()
    const photo_url = body?.photo_url == null ? null : String(body.photo_url).trim()

    const lat = body?.lat
    const lng = body?.lng
    const radius = body?.radius

    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    if (typeof lat !== 'number' || typeof lng !== 'number') return NextResponse.json({ error: 'lat/lng must be numbers' }, { status: 400 })

    const r = typeof radius === 'number' && Number.isFinite(radius) ? Math.max(1, Math.round(radius)) : 80

    const { data, error } = await supabase
      .from('sites')
      .insert({ name, address, notes, photo_url, lat, lng, radius: r })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
