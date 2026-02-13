// app/api/me/jobs/stop/route.ts
import { NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StopBody = {
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

type TimeLogRow = { id: string; started_at: string | null };

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    const guard = await requireUser(req);
    const supabase = guard.supabase;
    const uid = guard.userId;

    const body: StopBody = await req.json().catch(() => ({} as StopBody));
    const jobId: string | null = body.jobId || body.job_id || body.id || null;

    if (!jobId) return NextResponse.json({ error: 'Нужен id смены.' }, { status: 400 });

    const lat = toNum(body.lat);
    const lng = toNum(body.lng);
    const acc = toNum(body.accuracy);

    if (lat === null || lng === null || acc === null) {
      return NextResponse.json({ error: 'Нужны координаты и точность GPS.' }, { status: 400 });
    }

    const { data: jobRaw, error: jobErr } = await supabase
      .from('jobs')
      .select('id,status,worker_id,site:sites(lat,lng,radius)')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 400 });
    if (!jobRaw) return NextResponse.json({ error: 'Смена не найдена.' }, { status: 404 });

    const job: JobRow = jobRaw as unknown as JobRow;

    if (job.status !== 'in_progress') {
      return NextResponse.json({ error: 'Стоп доступен только для смен в работе.' }, { status: 400 });
    }

    let allowed = job.worker_id === uid;

    if (!allowed) {
      const { data: linkRaw, error: linkErr } = await supabase
        .from('job_workers')
        .select('job_id')
        .eq('job_id', jobId)
        .eq('worker_id', uid)
        .maybeSingle();

      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

      const link: JobWorkerRow | null = (linkRaw as unknown as JobWorkerRow | null) ?? null;
      allowed = !!(link && link.job_id);
    }

    if (!allowed) return NextResponse.json({ error: 'Нет доступа к этой смене.' }, { status: 403 });

    const site = job.site;
    if (!site || site.lat === null || site.lng === null) {
      return NextResponse.json({ error: 'У объекта нет координат. Стоп запрещён.' }, { status: 400 });
    }

    const radius = site.radius ?? 0;
    if (!radius || radius <= 0) {
      return NextResponse.json({ error: 'У объекта не задан радиус. Стоп запрещён.' }, { status: 400 });
    }

    if (acc > 80) {
      return NextResponse.json(
        { error: `Точность GPS слишком низкая: ${Math.round(acc)} м (нужно ≤ 80 м).` },
        { status: 400 }
      );
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng);
    if (dist > radius) {
      return NextResponse.json(
        { error: `Вы далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).` },
        { status: 400 }
      );
    }

    const { data: logRaw, error: logErr } = await supabase
      .from('time_logs')
      .select('id,started_at')
      .eq('job_id', jobId)
      .eq('worker_id', uid)
      .is('stopped_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });
    if (!logRaw) return NextResponse.json({ error: 'Нет активного старта по этой смене.' }, { status: 400 });

    const log: TimeLogRow = logRaw as unknown as TimeLogRow;

    const stoppedAt = new Date().toISOString();

    const { error: updLogErr } = await supabase
      .from('time_logs')
      .update({
        stopped_at: stoppedAt,
        stop_lat: lat,
        stop_lng: lng,
        stop_accuracy: acc,
      })
      .eq('id', log.id);

    if (updLogErr) return NextResponse.json({ error: updLogErr.message }, { status: 400 });

    const { error: updJobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', jobId);
    if (updJobErr) return NextResponse.json({ error: updJobErr.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
