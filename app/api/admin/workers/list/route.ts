import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (!guard.ok) return NextResponse.json({ error: guard.message }, { status: guard.status })

  const supabase = supabaseService()

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (usersErr) {
    // Не валим всё из-за email — просто вернём без почт
    return NextResponse.json({
      workers: (profiles || []).map((p: any) => ({ ...p, email: null })),
    })
  }

  const emailById = new Map<string, string | null>()
  for (const u of usersData.users) emailById.set(u.id, u.email ?? null)

  const merged = (profiles || []).map((p: any) => ({
    ...p,
    email: emailById.get(p.id) ?? null,
  }))

  return NextResponse.json({ workers: merged })
}
