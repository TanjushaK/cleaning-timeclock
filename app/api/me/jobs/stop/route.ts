// app/api/me/jobs/stop/route.ts
import { NextResponse } from 'next/server';
import { AppApiErrorCodes } from '@/lib/app-error-codes';
import { requireActiveWorker, toErrorResponse } from '@/lib/supabase-server';

function jsonErr(status: number, message: string, errorCode: string) {
  return NextResponse.json({ error: message, errorCode }, { status });
}

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
    const guard = await requireActiveWorker(req);
    const supabase = guard.supabase;
    const uid = guard.userId;

    const body: StopBody = await req.json().catch(() => ({} as StopBody));
    const jobId: string | null = body.jobId || body.job_id || body.id || null;

    if (!jobId)
      return jsonErr(400, 'Job id is required.', AppApiErrorCodes.JOB_ID_REQUIRED);

    const lat = toNum(body.lat);
    const lng = toNum(body.lng);
    const acc = toNum(body.accuracy);

    if (lat === null || lng === null || acc === null) {
      return jsonErr(
        400,
        'Latitude, longitude and GPS accuracy are required.',
        AppApiErrorCodes.GPS_LAT_LNG_ACCURACY_REQUIRED,
      );
    }

    const { data: jobRaw, error: jobErr } = await supabase
      .from('jobs')
      .select('id,status,worker_id,site:sites(lat,lng,radius)')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr) return jsonErr(400, jobErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    if (!jobRaw) return jsonErr(404, 'Shift not found.', AppApiErrorCodes.JOB_NOT_FOUND);

    const job: JobRow = jobRaw as unknown as JobRow;

    if (job.status !== 'in_progress') {
      return jsonErr(400, 'Stop is only allowed for in-progress shifts.', AppApiErrorCodes.JOB_STOP_STATUS_INVALID);
    }

    let allowed = job.worker_id === uid;

    if (!allowed) {
      const { data: linkRaw, error: linkErr } = await supabase
        .from('job_workers')
        .select('job_id')
        .eq('job_id', jobId)
        .eq('worker_id', uid)
        .maybeSingle();

      if (linkErr) return jsonErr(400, linkErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);

      const link: JobWorkerRow | null = (linkRaw as unknown as JobWorkerRow | null) ?? null;
      allowed = !!(link && link.job_id);
    }

    if (!allowed)
      return jsonErr(403, 'No access to this shift.', AppApiErrorCodes.JOB_ACCESS_DENIED);

    const site = job.site;
    if (!site || site.lat === null || site.lng === null) {
      return jsonErr(400, 'Site has no coordinates.', AppApiErrorCodes.SITE_COORDINATES_MISSING);
    }

    const radius = site.radius ?? 0;
    if (!radius || radius <= 0) {
      return jsonErr(400, 'Site has no valid radius.', AppApiErrorCodes.SITE_RADIUS_MISSING);
    }

    if (acc > 80) {
      return jsonErr(
        400,
        `GPS accuracy too low: ${Math.round(acc)} m (max 80 m).`,
        AppApiErrorCodes.GPS_ACCURACY_TOO_LOW,
      );
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng);
    if (dist > radius) {
      return jsonErr(
        400,
        `Too far from site: ${Math.round(dist)} m (max ${Math.round(radius)} m).`,
        AppApiErrorCodes.TOO_FAR_FROM_SITE,
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

    if (logErr) return jsonErr(400, logErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    if (!logRaw)
      return jsonErr(400, 'No open time log for this shift.', AppApiErrorCodes.TIME_LOG_NOT_OPEN);

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

    if (updLogErr) return jsonErr(400, updLogErr.message, AppApiErrorCodes.INTERNAL);

    const { error: updJobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', jobId);
    if (updJobErr) return jsonErr(400, updJobErr.message, AppApiErrorCodes.INTERNAL);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}


