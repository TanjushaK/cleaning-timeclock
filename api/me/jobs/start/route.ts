// app/api/me/jobs/start/route.ts
import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic';

type StartBody = {
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

    const body: StartBody = await req.json().catch(() => ({} as StartBody));
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

    if (job.status !== 'planned' 'РЎС‚Р°СЂС‚ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ Р·Р°РїР»Р°РЅРёСЂРѕРІР°РЅРЅС‹С… СЃРјРµРЅ.' }, { status: 400 });
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
      return NextResponse.json({ error: 'РЈ РѕР±СЉРµРєС‚Р° РЅРµС‚ РєРѕРѕСЂРґРёРЅР°С‚. РЎС‚Р°СЂС‚ Р·Р°РїСЂРµС‰С‘РЅ.' }, { status: 400 });
    }

    const radius = site.radius ?? 0;
    if (!radius || radius <= 0) {
      return NextResponse.json({ error: 'РЈ РѕР±СЉРµРєС‚Р° РЅРµ Р·Р°РґР°РЅ СЂР°РґРёСѓСЃ. РЎС‚Р°СЂС‚ Р·Р°РїСЂРµС‰С‘РЅ.' }, { status: 400 });
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

    const startedAt = new Date().toISOString();

    const { error: insErr } = await supabase.from('time_logs').insert({
      job_id: jobId,
      worker_id: uid,
      started_at: startedAt,
      start_lat: lat,
      start_lng: lng,
      start_accuracy: acc,
    });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    const { error: updErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}



