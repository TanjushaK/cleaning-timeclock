import { NextResponse } from 'next/server'
import { ApiError, requireUser } from '@/lib/supabase-server'

type StartBody = {
  jobId?: string
  job_id?: string
  id?: string
  lat?: number
  lng?: number
  accuracy?: number
}

type JobSite = { lat: number | null; lng: number | null; radius: number | null } | null

type JobRow = {
  id: string
  status: string | null
  worker_id: string | null
  site: JobSite
}

function toNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function POST(req: Request) {
  try {
    const { user, supabase } = await requireUser(req.headers)
    const body = (await req.json().catch(() => ({}))) as StartBody

    const jobId = String(body.jobId || body.job_id || body.id || '').trim()
    if (!jobId) throw new ApiError(400, 'jobId обязателен')

    const lat = toNum(body.lat)
    const lng = toNum(body.lng)
    const accuracy = toNum(body.accuracy)

    if (lat == null || lng == null || accuracy == null) throw new ApiError(400, 'Нужна геопозиция (lat/lng/accuracy)')
    if (accuracy > 80) throw new ApiError(400, `Точность GPS слишком низкая: ${Math.round(accuracy)}м (нужно ≤ 80м)`)

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id,status,worker_id,site:sites(lat,lng,radius)')
      .eq('id', jobId)
      .maybeSingle()

    if (jobError) throw new ApiError(400, jobError.message)
    if (!job) throw new ApiError(404, 'Смена не найдена')

    const jr = job as unknown as JobRow
    if (!jr.worker_id || jr.worker_id !== user.id) throw new ApiError(403, 'Смена не закреплена за этим работником')

    if (jr.status === 'done') throw new ApiError(400, 'Смена уже завершена')

    const site = jr.site
    if (!site || site.lat == null || site.lng == null || site.radius == null) {
      throw new ApiError(400, 'У объекта нет координат/радиуса')
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng)
    if (dist > site.radius) {
      throw new ApiError(400, `Ты слишком далеко от объекта: ${Math.round(dist)}м (разрешено ≤ ${site.radius}м)`)
    }

    // если уже in_progress — просто подтверждаем
    if (jr.status !== 'in_progress') {
      const { error: upErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId)
      if (upErr) throw new ApiError(400, upErr.message)
    }

    const { error: insErr } = await supabase.from('time_logs').insert({
      job_id: jobId,
      worker_id: user.id,
      started_at: new Date().toISOString(),
      start_lat: lat,
      start_lng: lng,
      start_accuracy: accuracy,
    })

    if (insErr) throw new ApiError(400, insErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const s = e?.status || 500
    return NextResponse.json({ error: e?.message || 'Ошибка' }, { status: s })
  }
}
