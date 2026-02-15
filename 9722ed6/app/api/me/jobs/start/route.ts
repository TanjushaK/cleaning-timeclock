import { NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/supabase-server';
import { metersDistance } from '@/lib/ru-format';

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);
    const body = await req.json();

    const id = String(body?.id || '');
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
    if (jobStatus !== 'planned') throw new ApiError(400, 'START доступен только из planned');

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

    const now = new Date().toISOString();

    const { error: updErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', id);
    if (updErr) throw new ApiError(500, 'Не смог обновить статус job');

    const { data: logRow, error: insErr } = await supabase
      .from('time_logs')
      .insert({
        job_id: id,
        site_id: siteId,
        worker_id: userId,
        started_at: now,
        start_lat: lat,
        start_lng: lng,
        start_accuracy: accuracy,
      })
      .select('id')
      .maybeSingle();

    if (insErr) throw new ApiError(500, 'Не смог создать time_log');

    return NextResponse.json({ ok: true, time_log_id: (logRow as any)?.id ?? null }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
