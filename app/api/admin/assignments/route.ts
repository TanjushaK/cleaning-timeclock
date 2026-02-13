import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

  const supabase = supabaseService()

  const { data, error } = await supabase.from('site_assignments').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ assignments: data || [] })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

  const supabase = supabaseService()
  const body = await req.json().catch(() => null)

  const site_id = body?.site_id as string | undefined
  const worker_id = body?.worker_id as string | undefined

  if (!site_id || !worker_id) {
    return NextResponse.json({ error: 'site_id и worker_id обязательны' }, { status: 400 })
  }

  const { error } = await supabase.from('site_assignments').upsert({ site_id, worker_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

  const supabase = supabaseService()
  const body = await req.json().catch(() => null)

  const site_id = body?.site_id as string | undefined
  const worker_id = body?.worker_id as string | undefined

  if (!site_id || !worker_id) {
    return NextResponse.json({ error: 'site_id и worker_id обязательны' }, { status: 400 })
  }

  const { error } = await supabase
    .from('site_assignments')
    .delete()
    .eq('site_id', site_id)
    .eq('worker_id', worker_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
