// app/api/me/jobs/stop/route.ts
import { NextResponse } from 'next/server';
import { AppApiErrorCodes } from '@/lib/app-error-codes';
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db';
import { withClient } from '@/lib/server/pool';

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
type OpenLogRow = { id: string; started_at: string | null };
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

function computeJobStatus(
  currentStatus: string | null,
  primaryWorkerId: string | null,
  linkedWorkers: ParticipantRow[],
  logs: TeamTimeLogRow[],
) {
  const rawStatus = String(currentStatus || '').toLowerCase();
  if (rawStatus === 'cancelled' || rawStatus === 'canceled') return rawStatus;

  const participants = new Set<string>();
  if (primaryWorkerId) participants.add(String(primaryWorkerId));
  for (const row of linkedWorkers) {
    if (row.worker_id) participants.add(String(row.worker_id));
  }

  let hasOpenLog = false;
  let hasAnyStartedLog = false;
  const completedWorkers = new Set<string>();

  for (const row of logs) {
    const workerId = row.worker_id ? String(row.worker_id) : '';
    if (!workerId || !row.started_at) continue;
    hasAnyStartedLog = true;
    if (!row.stopped_at) hasOpenLog = true;
    else completedWorkers.add(workerId);
  }

  const allParticipantsCompleted =
    participants.size > 0 && Array.from(participants).every((workerId) => completedWorkers.has(workerId));

  if (hasOpenLog) return 'in_progress';
  if (allParticipantsCompleted) return 'done';
  if (hasAnyStartedLog) return 'in_progress';
  return 'planned';
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

    const result = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        // Match the Start lock order: shared job status first, participant second.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('job-status'), hashtext($1))", [jobId]);
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [jobId, uid]);

        const openResult = await client.query<OpenLogRow>(
          `SELECT id, started_at
             FROM time_logs
            WHERE job_id = $1
              AND worker_id = $2
              AND stopped_at IS NULL
            ORDER BY started_at DESC
            FOR UPDATE`,
          [jobId, uid],
        );

        const openLogs = openResult.rows;
        if (!openLogs.length) {
          await client.query('COMMIT');
          return { alreadyStopped: true, stoppedAt: null as string | null, closedLogs: 0, status: null as string | null };
        }

        const stoppedAt = new Date().toISOString();
        const openLogIds = openLogs.map((row) => row.id);

        await client.query(
          `UPDATE time_logs
              SET stopped_at = $1,
                  stop_lat = $2,
                  stop_lng = $3,
                  stop_accuracy = $4
            WHERE id = ANY($5::uuid[])`,
          [stoppedAt, lat, lng, acc, openLogIds],
        );

        const currentJobResult = await client.query<JobRow>(
          `SELECT id, status, worker_id, site_id
             FROM jobs
            WHERE id = $1
            FOR UPDATE`,
          [jobId],
        );
        const currentJob = currentJobResult.rows[0] || job;

        const linkedResult = await client.query<ParticipantRow>(
          `SELECT worker_id
             FROM job_workers
            WHERE job_id = $1`,
          [jobId],
        );

        const logsResult = await client.query<TeamTimeLogRow>(
          `SELECT worker_id, started_at, stopped_at
             FROM time_logs
            WHERE job_id = $1`,
          [jobId],
        );

        const nextStatus = computeJobStatus(
          currentJob.status,
          currentJob.worker_id,
          linkedResult.rows,
          logsResult.rows,
        );

        if (nextStatus !== String(currentJob.status || '').toLowerCase()) {
          await client.query('UPDATE jobs SET status = $1 WHERE id = $2', [nextStatus, jobId]);
        }

        await client.query('COMMIT');
        return { alreadyStopped: false, stoppedAt, closedLogs: openLogIds.length, status: nextStatus };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    if (result.alreadyStopped) {
      return NextResponse.json(
        { ok: true, already_stopped: true, stopped_at: result.stoppedAt, closed_logs: 0 },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: true, stopped_at: result.stoppedAt, closed_logs: result.closedLogs, job_status: result.status },
      { status: 200 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
