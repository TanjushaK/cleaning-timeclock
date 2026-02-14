import { NextResponse } from 'next/server'
import { ApiError, requireUser } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  jobId?: string
  job_id?: string
  id?: string
  lat?: number | string
  lng?: number | string
  accuracy?: number | string
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    if (Number.isFinite(n)) return n
  }
  return null
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

type JobRow = {
  id: string
  worker_id: string | null
  site: {
    lat: number | null
    lng: number | null
    radius: number | null
  } | null
}

type LogRow = {
  id: string
  started_at: string | null
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    const body: Body = await req.json().catch(() => ({} as Body))

    const jobId = String(body.jobId ?? body.job_id ?? body.id ?? '').trim()
    if (!jobId) throw new ApiError(400, 'Нужен id смены.')

    const lat = toNum(body.lat)
    const lng = toNum(body.lng)
    const accuracy = toNum(body.accuracy)

    if (lat == null || lng == null || accuracy == null) {
      throw new ApiError(400, 'Нужны координаты и точность GPS.')
    }

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id,worker_id,site:sites(lat,lng,radius)')
      .eq('id', jobId)
      .maybeSingle()

    if (jobErr) throw new ApiError(400, jobErr.message)
    if (!job) throw new ApiError(404, 'Смена не найдена.')

    const j = job as unknown as JobRow
    if ((j.worker_id || '') !== userId) throw new ApiError(403, 'Нет доступа к этой смене.')

    const site = j.site
    if (!site || site.lat == null || site.lng == null) throw new ApiError(400, 'У объекта нет координат. Стоп запрещён.')

    const radius = typeof site.radius === 'number' && Number.isFinite(site.radius) ? site.radius : 150

    if (accuracy > 80) {
      throw new ApiError(400, `Точность GPS слишком низкая: ${Math.round(accuracy)} м (нужно ≤ 80 м).`)
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng)
    if (dist > radius) {
      throw new ApiError(400, `Ты далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).`)
    }

    // находим активный лог (где stopped_at IS NULL)
    const { data: activeLog, error: logErr } = await supabase
      .from('time_logs')
      .select('id,started_at')
      .eq('job_id', jobId)
      .eq('worker_id', userId)
      .is('stopped_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (logErr) throw new ApiError(400, logErr.message)
    if (!activeLog?.id) throw new ApiError(400, 'Нет активной смены (не найден start).')

    const logRow = activeLog as unknown as LogRow
    const stoppedAt = new Date().toISOString()

    const { error: updLogErr } = await supabase
      .from('time_logs')
      .update({
        stopped_at: stoppedAt,
        stop_lat: lat,
        stop_lng: lng,
        stop_accuracy: accuracy,
      })
      .eq('id', logRow.id)

    if (updLogErr) throw new ApiError(400, updLogErr.message)

    const { error: updJobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', jobId)
    if (updJobErr) throw new ApiError(400, updJobErr.message)

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    return NextResponse.json({ error: e?.message || 'Ошибка' }, { status })
  }
}
