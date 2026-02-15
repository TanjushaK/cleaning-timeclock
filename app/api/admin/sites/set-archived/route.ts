import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => null)
  const siteId = body?.site_id ? String(body.site_id) : ''
  const archived = !!body?.archived

  if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })

  const patch = archived ? { archived_at: new Date().toISOString() } : { archived_at: null }

  const { data, error } = await supabaseAdmin.from('sites').update(patch).eq('id', siteId).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ site: data })
}
