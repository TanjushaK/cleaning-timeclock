import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, supabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function jsonOk(data: any) {
  return NextResponse.json(data, { status: 200 })
}

function jsonErr(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)

    const supabase = supabaseService()
    const { data, error } = await supabase.from('site_assignments').select('*')

    if (error) return jsonErr(500, error.message)
    return jsonOk({ assignments: data || [] })
  } catch (e: any) {
    if (e instanceof ApiError) return jsonErr(e.status, e.message)
    return jsonErr(500, e?.message || 'Внутренняя ошибка')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req)

    const supabase = supabaseService()
    const body = await req.json().catch(() => null)

    const site_id = body?.site_id as string | undefined
    const worker_id = body?.worker_id as string | undefined

    if (!site_id || !worker_id) return jsonErr(400, 'site_id и worker_id обязательны')

    const { error } = await supabase.from('site_assignments').upsert({ site_id, worker_id })
    if (error) return jsonErr(500, error.message)

    return jsonOk({ ok: true })
  } catch (e: any) {
    if (e instanceof ApiError) return jsonErr(e.status, e.message)
    return jsonErr(500, e?.message || 'Внутренняя ошибка')
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req)

    const supabase = supabaseService()
    const body = await req.json().catch(() => null)

    const site_id = body?.site_id as string | undefined
    const worker_id = body?.worker_id as string | undefined

    if (!site_id || !worker_id) return jsonErr(400, 'site_id и worker_id обязательны')

    const { error } = await supabase
      .from('site_assignments')
      .delete()
      .eq('site_id', site_id)
      .eq('worker_id', worker_id)

    if (error) return jsonErr(500, error.message)

    return jsonOk({ ok: true })
  } catch (e: any) {
    if (e instanceof ApiError) return jsonErr(e.status, e.message)
    return jsonErr(500, e?.message || 'Внутренняя ошибка')
  }
}
