import { NextResponse } from 'next/server'
import { ApiError, requireUser, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isMissingTableError(msg: string) {
  const s = msg.toLowerCase()
  return s.includes('could not find the table') || s.includes('does not exist') || s.includes('relation')
}

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req)

    // Пытаемся прочитать job_workers, но НЕ падаем если таблицы нет.
    let extraJobIds: string[] = []
    const { data: jw, error: jwErr } = await supabase
      .from('job_workers')
      .select('job_id')
      .eq('worker_id', userId)

    if (jwErr) {
      if (!isMissingTableError(jwErr.message)) {
        // ошибка не про отсутствие таблицы -> настоящий баг/права -> сигнализируем
        throw new ApiError(400, jwErr.message)
      }
    } else {
      extraJobIds = (jw ?? [])
        .map((r: any) => r?.job_id)
        .filter((v: any) => typeof v === 'string' && v.length > 0)
    }

    // Плановые поля обязаны быть в выдаче
    let q = supabase
      .from('jobs')
      .select(`
        id,
        title,
        status,
        job_date,
        scheduled_time,
        planned_minutes,
        site_id,
        worker_id,
        site:sites(
          id,
          name,
          address,
          lat,
          lng,
          radius,
          default_minutes,
          photo_url
        )
      `)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    // Основной канал назначения: jobs.worker_id.
    // Доп. канал: job_workers (если есть записи).
    if (extraJobIds.length > 0) {
      q = q.or(`worker_id.eq.${userId},id.in.(${extraJobIds.join(',')})`)
    } else {
      q = q.eq('worker_id', userId)
    }

    const { data: jobs, error } = await q
    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ jobs: jobs || [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
