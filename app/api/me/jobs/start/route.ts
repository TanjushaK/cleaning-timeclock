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
    if (String((job as any).worker_id) !== userId) throw new ApiError(403, 'Это не твоя смена');
    if (String((job as any).status) !== 'planned') throw new ApiError(400, 'START доступен только из planned');

    const siteId = String((job as any).site_id);

    const { data: site, error: sErr } = await supabase
      .from('sites')
      .select('id, lat, lng, radius')
      .eq('id', siteId)
      .maybeSingle();

    if (sErr) throw new ApiError(500, 'Не смог прочитать site');
    if (!site) throw new ApiError(404, 'Site не найден');

    const siteLat = site.lat;
    const siteLng = site.lng;
    const radius = site.radius;

    if (siteLat == null || siteLng == null) throw new ApiError(400, 'На объекте нет координат (lat/lng)');
    if (radius == null) throw new ApiError(400, 'На объекте нет radius');

    if (accuracy == null || accuracy > 80) throw new ApiError(400, 'Слишком плохая точность GPS (нужно ≤ 80м)');
    if (lat == null || lng == null) throw new ApiError(400, 'Нет координат устройства');

    const dist = metersDistance(siteLat, siteLng, lat, lng);
    if (dist > radius) throw new ApiError(400, `Ты вне зоны объекта: ${Math.round(dist)}м (радиус ${radius}м)`);

    const { error: uErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', id);
    if (uErr) throw new ApiError(500, 'Не смог обновить статус job');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
