import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let ASSIGNMENTS_TABLE: string | null = null

function isMissingTableError(msg: string) {
  const s = msg.toLowerCase()
  return s.includes('could not find the table') || s.includes('does not exist') || s.includes('relation')
}

async function resolveAssignmentsTable(admin: SupabaseClient) {
  if (ASSIGNMENTS_TABLE) return ASSIGNMENTS_TABLE
  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await admin.from(t).select('site_id,worker_id').limit(1)
    if (!error || !isMissingTableError(String(error?.message || ''))) {
      ASSIGNMENTS_TABLE = t
      return t
    }
  }
  throw new Error('Не найдена таблица назначений (assignments/site_workers).')
}

function normalizeTime(v: string) {
  const s = v.trim()
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return null
  const hh = String(Math.max(0, Math.min(23, parseInt(m[1], 10)))).padStart(2, '0')
  const mm = String(Math.max(0, Math.min(59, parseInt(m[2], 10)))).padStart(2, '0')
  return `${hh}:${mm}:00`
}

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => ({} as any))
    const site_id = String(body?.site_id || '').trim()
    const job_date = String(body?.job_date || '').trim()
    const scheduled_time = normalizeTime(String(body?.scheduled_time || ''))
    const worker_ids = Array.isArray(body?.worker_ids) ? body.worker_ids.map((x: any) => String(x).trim()).filter(Boolean) : []

    if (!site_id) throw new ApiError(400, 'site_id обязателен')
    if (!job_date) throw new ApiError(400, 'job_date обязателен')
    if (!scheduled_time) throw new ApiError(400, 'scheduled_time неверный формат')
    if (worker_ids.length === 0) throw new ApiError(400, 'Выбери хотя бы одного работника')

    const { data: site, error: sErr } = await supabase
      .from('sites')
      .select('id, default_minutes')
      .eq('id', site_id)
      .single()

    if (sErr) throw new ApiError(400, sErr.message)

    const planned_minutes = site?.default_minutes != null ? Number(site.default_minutes) : 120

    // гарантируем связь “объект ↔ работник” (таблица названия неуказано → autodetect)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const assignTable = await resolveAssignmentsTable(admin)

    for (const wid of worker_ids) {
      const { data: ex, error: exErr } = await admin.from(assignTable).select('site_id,worker_id').eq('site_id', site_id).eq('worker_id', wid).limit(1)
      if (exErr) throw new ApiError(500, exErr.message)
      if (!Array.isArray(ex) || ex.length === 0) {
        const { error: insAErr } = await admin.from(assignTable).insert([{ site_id, worker_id: wid }])
        if (insAErr) throw new ApiError(500, insAErr.message)
      }
    }

    const rows = worker_ids.map((worker_id: string) => ({
      site_id,
      worker_id,
      job_date,
      scheduled_time,
      planned_minutes,
      status: 'planned',
    }))

    const { data, error } = await admin.from('jobs').insert(rows).select('id')
    if (error) throw new ApiError(500, error.message)

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
