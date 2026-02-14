import { NextResponse } from 'next/server'
import { ApiError, requireUser } from '@/lib/supabase-server'

type StopBody = {
  jobId?: string
  job_id?: string
  id?: string
  lat?: number
  lng?: number
  accuracy?: number
}

function toNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: Request) {
  try {
    const { user, supabase } = await requireUser(req.headers)
    const body = (await req.json().catch(() => ({}))) as StopBody

    const jobId = String(body.jobId || body.job_id || body.id || '').trim()
    if (!jobId) throw new ApiError(400, 'jobId обязателен')

    const lat = toNum(body.lat)
    const lng = toNum(body.lng)
    const accuracy = toNum(body.accuracy)

    if (lat == null || lng == null || accuracy == null) throw new ApiError(400, 'Нужна геопозиция (lat/lng/accuracy)')
    if (accuracy > 80) throw new ApiError(400, `Точность GPS слишком низкая: ${Math.round(accuracy)}м (нужно ≤ 80м)`)

    // проверка что смена его
    const { data: job, error: jobErr } = await supabase.from('jobs').select('id,worker_id,status').eq('id', jobId).maybeSingle()
    if (jobErr) throw new ApiError(400, jobErr.message)
    if (!job) throw new ApiError(404, 'Смена не найдена')
    if (!job.worker_id || job.worker_id !== user.id) throw new ApiError(403, 'Смена не закреплена за этим работником')

    const { data: log, error: logErr } = await supabase
      .from('time_logs')
      .select('id')
      .eq('job_id', jobId)
      .eq('worker_id', user.id)
      .is('stopped_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (logErr) throw new ApiError(400, logErr.message)
    if (!log) throw new ApiError(400, 'Нет активного START для этой смены')

    const { error: updErr } = await supabase
      .from('time_logs')
      .update({
        stopped_at: new Date().toISOString(),
        end_lat: lat,
        end_lng: lng,
        end_accuracy: accuracy,
      })
      .eq('id', log.id)

    if (updErr) throw new ApiError(400, updErr.message)

    const { error: jobUpdErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', jobId)
    if (jobUpdErr) throw new ApiError(400, jobUpdErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const s = e?.status || 500
    return NextResponse.json({ error: e?.message || 'Ошибка' }, { status: s })
  }
}
