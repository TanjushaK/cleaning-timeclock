// app/api/me/jobs/start/route.ts
import { NextResponse } from 'next/server';
import { requireActiveWorker, toErrorResponse } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StartBody = {
  event_id?: string;
  eventId?: string;
  jobId?: string;
  job_id?: string;
  id?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
};

type JobSite = { lat: number | null; lng: number | null; radius: number | null } | null;

type JobRow = {
  id: string;
  status: string | null;
  worker_id: string | null;
  site: JobSite;
};

type JobWorkerRow = { job_id: string | null };

type TimeLogRow = { id: string };

type ClientEventRow = {
  event_id: string;
  user_id: string;
  kind: string;
  job_id: string;
  status: string;
  error: string | null;
};

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function POST(req: Request) {
  try {
    const guard = await requireActiveWorker(req);
    const supabase = guard.supabase;
    const uid = guard.userId;

    const body: StartBody = await req.json().catch(() => ({} as StartBody));
    const jobId: string | null = body.jobId || body.job_id || body.id || null;

    if (!jobId) return NextResponse.json({ error: 'Нужен id смены.' }, { status: 400 });

    const lat = toNum(body.lat);
    const lng = toNum(body.lng);
    const acc = toNum(body.accuracy);

    if (lat === null || lng === null || acc === null) {
      return NextResponse.json({ error: 'Нужны координаты и точность GPS.' }, { status: 400 });
    }

    const eventIdRaw = (body.event_id || body.eventId || '').trim();
    const eventId = eventIdRaw ? eventIdRaw : null;
    if (eventId && !isUuid(eventId)) {
      return NextResponse.json({ error: 'event_id должен быть UUID.' }, { status: 400 });
    }

    let eventRow: ClientEventRow | null = null;
    let eventExisting = false;

    async function readEvent(): Promise<ClientEventRow | null> {
      const { data, error } = await supabase
        .from('client_events')
        .select('event_id,user_id,kind,job_id,status,error')
        .eq('event_id', eventId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as ClientEventRow | null) ?? null;
    }

    async function setEventStatus(status: 'done' | 'failed', errorMessage: string | null) {
      if (!eventId) return;
      await supabase
        .from('client_events')
        .update({ status, error: errorMessage })
        .eq('event_id', eventId);
    }

    if (eventId) {
      const { error: insErr } = await supabase.from('client_events').insert({
        event_id: eventId,
        user_id: uid,
        kind: 'start',
        job_id: jobId,
        status: 'pending',
      });

      if (insErr) {
        if (String((insErr as any).code || '') !== '23505') {
          return NextResponse.json({ error: insErr.message }, { status: 400 });
        }
        eventExisting = true;
      }

      eventRow = await readEvent();
      if (!eventRow) {
        return NextResponse.json({ error: 'client_events: событие не найдено.' }, { status: 500 });
      }
      if (eventRow.user_id !== uid || eventRow.job_id !== jobId || eventRow.kind !== 'start') {
        return NextResponse.json({ error: 'event_id конфликтует (не совпадает user/job/kind).' }, { status: 409 });
      }
      if (eventRow.status === 'done') {
        return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
      }
      if (eventRow.status === 'failed') {
        return NextResponse.json({ error: eventRow.error || 'Событие ранее завершилось ошибкой.' }, { status: 400 });
      }
    }

    const { data: jobRaw, error: jobErr } = await supabase
      .from('jobs')
      .select('id,status,worker_id,site:sites(lat,lng,radius)')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr) {
      await setEventStatus('failed', jobErr.message);
      return NextResponse.json({ error: jobErr.message }, { status: 400 });
    }
    if (!jobRaw) {
      await setEventStatus('failed', 'Смена не найдена.');
      return NextResponse.json({ error: 'Смена не найдена.' }, { status: 404 });
    }

    const job: JobRow = jobRaw as unknown as JobRow;

    let allowed = job.worker_id === uid;
    if (!allowed) {
      const { data: linkRaw, error: linkErr } = await supabase
        .from('job_workers')
        .select('job_id')
        .eq('job_id', jobId)
        .eq('worker_id', uid)
        .maybeSingle();

      if (linkErr) {
        await setEventStatus('failed', linkErr.message);
        return NextResponse.json({ error: linkErr.message }, { status: 400 });
      }

      const link: JobWorkerRow | null = (linkRaw as unknown as JobWorkerRow | null) ?? null;
      allowed = !!(link && link.job_id);
    }
    if (!allowed) {
      await setEventStatus('failed', 'Нет доступа к этой смене.');
      return NextResponse.json({ error: 'Нет доступа к этой смене.' }, { status: 403 });
    }

    const site = job.site;
    if (!site || site.lat === null || site.lng === null) {
      await setEventStatus('failed', 'У объекта нет координат. Старт запрещён.');
      return NextResponse.json({ error: 'У объекта нет координат.\nСтарт запрещён.' }, { status: 400 });
    }

    const radius = site.radius ?? 0;
    if (!radius || radius <= 0) {
      await setEventStatus('failed', 'У объекта не задан радиус. Старт запрещён.');
      return NextResponse.json({ error: 'У объекта не задан радиус.\nСтарт запрещён.' }, { status: 400 });
    }

    if (acc > 80) {
      const msg = `Точность GPS слишком низкая: ${Math.round(acc)} м (нужно ≤ 80 м).`;
      await setEventStatus('failed', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng);
    if (dist > radius) {
      const msg = `Вы далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).`;
      await setEventStatus('failed', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Идемпотентность на случай повторной доставки: если уже есть активный log — считаем старт выполненным.
    const { data: existingLogRaw, error: existingLogErr } = await supabase
      .from('time_logs')
      .select('id')
      .eq('job_id', jobId)
      .eq('worker_id', uid)
      .is('stopped_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLogErr) {
      await setEventStatus('failed', existingLogErr.message);
      return NextResponse.json({ error: existingLogErr.message }, { status: 400 });
    }

    const existingLog: TimeLogRow | null = (existingLogRaw as unknown as TimeLogRow | null) ?? null;
    if (existingLog) {
      // Если job ещё не переведён в in_progress — добиваем.
      const { error: updJobErr2 } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);
      if (updJobErr2) {
        await setEventStatus('failed', updJobErr2.message);
        return NextResponse.json({ error: updJobErr2.message }, { status: 400 });
      }
      await setEventStatus('done', null);
      return NextResponse.json({ ok: true, recovered: true }, { status: 200 });
    }

    if (job.status !== 'planned') {
      // Если это повтор того же event_id (pending) и смена уже стартовала — считаем done.
      if (eventId && eventExisting && job.status === 'in_progress') {
        await setEventStatus('done', null);
        return NextResponse.json({ ok: true, recovered: true }, { status: 200 });
      }
      const msg = 'Старт доступен только для запланированных смен.';
      await setEventStatus('failed', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const startedAt = new Date().toISOString();

    const { error: insErr } = await supabase.from('time_logs').insert({
      job_id: jobId,
      worker_id: uid,
      started_at: startedAt,
      start_lat: lat,
      start_lng: lng,
      start_accuracy: acc,
    });

    if (insErr) {
      await setEventStatus('failed', insErr.message);
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    const { error: updErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);
    if (updErr) {
      await setEventStatus('failed', updErr.message);
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    await setEventStatus('done', null);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
