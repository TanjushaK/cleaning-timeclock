import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

  const supabase = supabaseService()

  const { data, error } = await supabase.from('sites').select('*').order('id', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sites: data || [] })
}
