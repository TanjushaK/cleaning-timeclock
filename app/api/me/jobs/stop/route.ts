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

type JobRow = {
  id: string;
  status: string | null;
  worker_id: string | null;
  site_id: string | null;
};

type SiteRow = { id: string; lat: number | null; lng: number | null; radius: number | null };
type JobWorkerRow = { job_id: string | null };
type TimeLogRow = { id: string; started_at: string | null };
type ParticipantRow = { worker_id: string | null };
type TeamTimeLogRow = { worker_id: string | null; started_at: string | null; stopped_at: string | null };

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

async function recomputeSharedJobStatus(service: any, job: JobRow) {
  const rawStatus = String(job.status || '').toLowerCase();
  if (rawStatus === 'cancelled' || rawStatus === 'canceled') return;

  const participants = new Set<string>();
  if (job.worker_id) participants.add(String(job.worker_id));

  const { data: linkedRaw, error: linkedErr } = await service
    .from('job_workers')
    .select('worker_id')
    .eq('job_id', job.id);

  if (linkedErr) throw new ApiError(400, linkedErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);

  for (const row of (linkedRaw || []) as ParticipantRow[]) {
    if (row.worker_id) participants.add(String(row.worker_id));
  }

  const { data: logsRaw, error: logsErr } = await service
    .from('time_logs')
    .select('worker_id,started_at,stopped_at')
    .eq('job_id', job.id);

  if (logsErr) throw new ApiError(400, logsErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);

  let hasOpenLog = false;
  const completedWorkers = new Set<string>();

  for (const row of (logsRaw || []) as TeamTimeLogRow[]) {
    const workerId = row.worker_id ? String(row.worker_id) : '';
    if (!workerId || !row.started_at) continue;
    if (!row.stopped_at) hasOpenLog = true;
    else completedWorkers.add(workerId);
  }

  let nextStatus = 'planned';
  if (hasOpenLog) {
    nextStatus = 'in_progress';
  } else if (participants.size > 0 && Array.from(participants).every((workerId) => completedWorkers.has(workerId))) {
    nextStatus = 'done';
  }

  const { error: updateErr } = await service.from('jobs').update({ status: nextStatus }).eq('id', job.id);
  if (updateErr) throw new ApiError(400, updateErr.message, AppApiErrorCodes.JOB_ACCEPT_UPDATE_FAILED);
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
      .select('id,status,worker_id,site_id')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr) throw new ApiError(400, jobErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    if (!jobRaw) throw new ApiError(404, 'Job not found', AppApiErrorCodes.JOB_NOT_FOUND);

    const job: JobRow = jobRaw as unknown as JobRow;

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

    if (!job.site_id) {
      throw new ApiError(400, 'Site coordinates missing', AppApiErrorCodes.SITE_COORDINATES_MISSING);
    }

    const { data: siteRaw, error: siteErr } = await guard.service
      .from('sites')
      .select('id,lat,lng,radius')
      .eq('id', job.site_id)
      .maybeSingle();

    if (siteErr) throw new ApiError(400, siteErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    if (!siteRaw) throw new ApiError(400, 'Site coordinates missing', AppApiErrorCodes.SITE_COORDINATES_MISSING);

    const site: SiteRow = siteRaw as unknown as SiteRow;
    if (site.lat === null || site.lng === null) {
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

    await recomputeSharedJobStatus(guard.service, job);

    return NextResponse.json({ ok: true, stopped_at: stoppedAt }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
