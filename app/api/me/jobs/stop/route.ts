// app/api/me/jobs/stop/route.ts
import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic';

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
    const guard = await requireActiveWorker(req);
    const supabase = guard.supabase;
    const uid = guard.userId;

    const body: StopBody = await req.json().catch(() => ({} as StopBody));
    const jobId: string | null = body.jobId || body.job_id || body.id || null;

    if (!jobId) return NextResponse.json({ error: 'РќСѓР¶РµРЅ id СЃРјРµРЅС‹.' }, { status: 400 });

    const lat = toNum(body.lat);
    const lng = toNum(body.lng);
    const acc = toNum(body.accuracy);

    if (lat === null || lng === null || acc === null) {
      return NextResponse.json({ error: 'РќСѓР¶РЅС‹ РєРѕРѕСЂРґРёРЅР°С‚С‹ Рё С‚РѕС‡РЅРѕСЃС‚СЊ GPS.' }, { status: 400 });
    }

    const { data: jobRaw, error: jobErr } = await supabase
      .from('jobs' 'id,status,worker_id,site:sites(lat,lng,radius)' 'id', jobId)
      .maybeSingle();

    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 400 });
    if (!jobRaw) return NextResponse.json({ error: 'РЎРјРµРЅР° РЅРµ РЅР°Р№РґРµРЅР°.' }, { status: 404 });

    const job: JobRow = jobRaw as unknown as JobRow;

    if (job.status !== 'in_progress' 'РЎС‚РѕРї РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ СЃРјРµРЅ РІ СЂР°Р±РѕС‚Рµ.' }, { status: 400 });
    }

    let allowed = job.worker_id === uid;

    if (!allowed) {
      const { data: linkRaw, error: linkErr } = await supabase
        .from('job_workers' 'job_id' 'job_id' 'worker_id', uid)
        .maybeSingle();

      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

      const link: JobWorkerRow | null = (linkRaw as unknown as JobWorkerRow | null) ?? null;
      allowed = !!(link && link.job_id);
    }

    if (!allowed) return NextResponse.json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕР№ СЃРјРµРЅРµ.' }, { status: 403 });

    const site = job.site;
    if (!site || site.lat === null || site.lng === null) {
      return NextResponse.json({ error: 'РЈ РѕР±СЉРµРєС‚Р° РЅРµС‚ РєРѕРѕСЂРґРёРЅР°С‚. РЎС‚РѕРї Р·Р°РїСЂРµС‰С‘РЅ.' }, { status: 400 });
    }

    const radius = site.radius ?? 0;
    if (!radius || radius <= 0) {
      return NextResponse.json({ error: 'РЈ РѕР±СЉРµРєС‚Р° РЅРµ Р·Р°РґР°РЅ СЂР°РґРёСѓСЃ. РЎС‚РѕРї Р·Р°РїСЂРµС‰С‘РЅ.' }, { status: 400 });
    }

    if (acc > 80) {
      return NextResponse.json(
        { error: `РўРѕС‡РЅРѕСЃС‚СЊ GPS СЃР»РёС€РєРѕРј РЅРёР·РєР°СЏ: ${Math.round(acc)} Рј (РЅСѓР¶РЅРѕ в‰¤ 80 Рј).` },
        { status: 400 }
      );
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng);
    if (dist > radius) {
      return NextResponse.json(
        { error: `Р’С‹ РґР°Р»РµРєРѕ РѕС‚ РѕР±СЉРµРєС‚Р°: ${Math.round(dist)} Рј (РЅСѓР¶РЅРѕ в‰¤ ${Math.round(radius)} Рј).` },
        { status: 400 }
      );
    }

    const { data: logRaw, error: logErr } = await supabase
      .from('time_logs' 'id,started_at' 'job_id' 'worker_id' 'stopped_at' 'started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });
    if (!logRaw) return NextResponse.json({ error: 'РќРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ СЃС‚Р°СЂС‚Р° РїРѕ СЌС‚РѕР№ СЃРјРµРЅРµ.' }, { status: 400 });

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



