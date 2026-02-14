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

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const supabase = await assertAdmin(req)
    if (supabase instanceof NextResponse) return supabase

    const id = ctx.params.id
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, address, lat, lng, radius, notes, photo_url, archived_at')
      .eq('id', id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ site: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const supabase = await assertAdmin(req)
    if (supabase instanceof NextResponse) return supabase

    const id = ctx.params.id
    const body = await req.json().catch(() => null)

    const patch: any = {}

    if (body?.name !== undefined) {
      const name = String(body.name || '').trim()
      if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
      patch.name = name
    }

    if (body?.address !== undefined) patch.address = body.address == null ? null : String(body.address).trim()
    if (body?.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes).trim()
    if (body?.photo_url !== undefined) patch.photo_url = body.photo_url == null ? null : String(body.photo_url).trim()

    if (body?.lat !== undefined) {
      const n = Number(body.lat)
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'lat must be a number' }, { status: 400 })
      patch.lat = n
    }
    if (body?.lng !== undefined) {
      const n = Number(body.lng)
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'lng must be a number' }, { status: 400 })
      patch.lng = n
    }
    if (body?.radius !== undefined) {
      const n = Number(body.radius)
      if (!Number.isFinite(n) || n < 1 || n > 5000) return NextResponse.json({ error: 'radius must be 1..5000' }, { status: 400 })
      patch.radius = Math.round(n)
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

    const { error } = await supabase.from('sites').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
