// app/api/me/jobs/stop/route.ts
import { NextResponse } from 'next/server';
import { AppApiErrorCodes } from '@/lib/app-error-codes';
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db';

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
    const db = guard.db;
    const uid = guard.userId;

    const body: StopBody = await req.json().catch(() => ({} as StopBody));
    const jobId: string | null = body.jobId || body.job_id || body.id || null;

    if (!jobId) throw new ApiError(400, 'job id required', AppApiErrorCodes.JOB_ID_REQUIRED);

    const lat = toNum(body.lat);
    const lng = toNum(body.lng);
    const acc = toNum(body.accuracy);

    if (lat === null || lng === null || acc === null) {
      throw new ApiError(400, 'GPS lat/lng/accuracy required', AppApiErrorCodes.GPS_LAT_LNG_ACCURACY_REQUIRED);
    }

    const { data: jobRaw, error: jobErr } = await db
      .from('jobs')
      .select('id,status,worker_id,site:sites(lat,lng,radius)')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr) throw new ApiError(400, jobErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    if (!jobRaw) throw new ApiError(404, 'Job not found', AppApiErrorCodes.JOB_NOT_FOUND);

    const job: JobRow = jobRaw as unknown as JobRow;

    if (job.status !== 'in_progress') {
      throw new ApiError(400, 'Invalid job status for stop', AppApiErrorCodes.JOB_STOP_STATUS_INVALID);
    }

    let allowed = job.worker_id === uid;

    if (!allowed) {
      const { data: linkRaw, error: linkErr } = await db
        .from('job_workers')
        .select('job_id')
        .eq('job_id', jobId)
        .eq('worker_id', uid)
        .maybeSingle();

      if (linkErr) throw new ApiError(400, linkErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);

      const link: JobWorkerRow | null = (linkRaw as unknown as JobWorkerRow | null) ?? null;
      allowed = !!(link && link.job_id);
    }

    if (!allowed) throw new ApiError(403, 'Job access denied', AppApiErrorCodes.JOB_ACCESS_DENIED);

    const site = job.site;
    if (!site || site.lat === null || site.lng === null) {
      throw new ApiError(400, 'Site coordinates missing', AppApiErrorCodes.SITE_COORDINATES_MISSING);
    }

    const radius = site.radius ?? 0;
    if (!radius || radius <= 0) {
      throw new ApiError(400, 'Site radius missing', AppApiErrorCodes.SITE_RADIUS_MISSING);
    }

    if (acc > 80) {
      throw new ApiError(
        400,
        `GPS accuracy too low: ${Math.round(acc)} m`,
        AppApiErrorCodes.GPS_ACCURACY_TOO_LOW,
      );
    }

    const dist = haversineMeters(lat, lng, site.lat, site.lng);
    if (dist > radius) {
      throw new ApiError(
        400,
        `Too far from site: ${Math.round(dist)} m`,
        AppApiErrorCodes.TOO_FAR_FROM_SITE,
      );
    }

    const { data: logRaw, error: logErr } = await db
      .from('time_logs')
      .select('id,started_at')
      .eq('job_id', jobId)
      .eq('worker_id', uid)
      .is('stopped_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logErr) throw new ApiError(400, logErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    if (!logRaw) throw new ApiError(400, 'No open time log', AppApiErrorCodes.TIME_LOG_NOT_OPEN);

    const log: TimeLogRow = logRaw as unknown as TimeLogRow;

    const stoppedAt = new Date().toISOString();

    const { error: updLogErr } = await db
      .from('time_logs')
      .update({
        stopped_at: stoppedAt,
        stop_lat: lat,
        stop_lng: lng,
        stop_accuracy: acc,
      })
      .eq('id', log.id);

    if (updLogErr) throw new ApiError(400, updLogErr.message, AppApiErrorCodes.JOB_ACCEPT_UPDATE_FAILED);

    const { error: updJobErr } = await db.from('jobs').update({ status: 'done' }).eq('id', jobId);
    if (updJobErr) throw new ApiError(400, updJobErr.message, AppApiErrorCodes.JOB_ACCEPT_UPDATE_FAILED);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}


