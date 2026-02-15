import { NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/supabase-server';
import { metersDistance } from '@/lib/ru-format';

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const id = String(body?.job_id ?? body?.jobId ?? body?.id ?? '');
    const lat = typeof body?.lat === 'number' ? body.lat : null;
    const lng = typeof body?.lng === 'number' ? body.lng : null;
    const accuracy = typeof body?.accuracy === 'number' ? body.accuracy : null;

    if (!id) throw new ApiError(400, 'Нужен id job');

    const { data: job, error: jErr } = await supabase
      .from('jobs')
      .select('id, site_id, worker_id, status')
      .eq('id', id)
      .maybeSingle();

    if (jErr) throw new ApiError(500, 'Не смог прочитать job');
    if (!job) throw new ApiError(404, 'Job не найден');

    const jobWorkerId = String((job as any).worker_id || '');
    const jobStatus = String((job as any).status || '');

    if (jobWorkerId !== userId) throw new ApiError(403, 'Это не твоя смена');
    if (jobStatus !== 'in_progress') throw new ApiError(400, 'STOP доступен только из in_progress');

    const siteId = String((job as any).site_id || '');
    if (!siteId) throw new ApiError(400, 'У job нет site_id');

    const { data: site, error: sErr } = await supabase
      .from('sites')
      .select('id, lat, lng, radius')
      .eq('id', siteId)
      .maybeSingle();

    if (sErr) throw new ApiError(500, 'Не смог прочитать site');
    if (!site) throw new ApiError(404, 'Site не найден');

    const siteLat = (site as any).lat as number | null;
    const siteLng = (site as any).lng as number | null;
    const radius = (site as any).radius as number | null;

    if (siteLat == null || siteLng == null) throw new ApiError(400, 'На объекте нет координат (lat/lng)');
    if (radius == null) throw new ApiError(400, 'На объекте нет radius');

    if (accuracy == null || accuracy > 80) throw new ApiError(400, 'Слишком плохая точность GPS (нужно ≤ 80м)');
    if (lat == null || lng == null) throw new ApiError(400, 'Нет координат устройства');

    const dist = metersDistance(siteLat, siteLng, lat, lng);
    if (dist > radius) throw new ApiError(400, `Ты вне зоны объекта: ${Math.round(dist)}м (радиус ${radius}м)`);

    const { data: openLog, error: oErr } = await supabase
      .from('time_logs')
      .select('id')
      .eq('job_id', id)
      .eq('worker_id', userId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (oErr) throw new ApiError(500, 'Не смог прочитать time_logs');
    if (!openLog?.id) throw new ApiError(400, 'Не найден открытый time_log для этой смены');

    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from('time_logs')
      .update({
        ended_at: now,
        stop_lat: lat,
        stop_lng: lng,
        stop_accuracy: accuracy,
      })
      .eq('id', openLog.id);

    if (upErr) throw new ApiError(500, 'Не смог закрыть time_log');

    const { error: jobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', id);
    if (jobErr) throw new ApiError(500, 'Не смог обновить статус job');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
