// app/api/me/jobs/start/route.ts
import { NextResponse } from 'next/server';
import { AppApiErrorCodes } from '@/lib/app-error-codes';
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db';
import { withClient } from '@/lib/server/pool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StartBody = {
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

type JobWorkerRow = { job_id: string | null };
type OpenTimeLogRow = { id: string; started_at: string | null };

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

    const body: StartBody = await req.json().catch(() => ({} as StartBody));
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

    const jobStatus = String(job.status || '').toLowerCase();
    if (!['planned', 'in_progress', 'done'].includes(jobStatus)) {
      throw new ApiError(400, 'Invalid job status for start', AppApiErrorCodes.JOB_START_STATUS_INVALID);
    }

    const siteId = job.site_id;
    if (!siteId) {
      throw new ApiError(400, 'Site coordinates missing', AppApiErrorCodes.SITE_COORDINATES_MISSING);
    }

    const { data: siteRaw, error: siteErr } = await guard.service
      .from('sites')
      .select('id,lat,lng,radius')
      .eq('id', siteId)
      .maybeSingle();

    if (siteErr) {
      throw new ApiError(400, siteErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);
    }

    const site = (siteRaw as { id: string; lat: number | null; lng: number | null; radius: number | null } | null) ?? null;
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

    const result = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        // All Start/Stop operations for the same job update one shared status.
        // Keep this lock first in both routes to avoid status races and deadlocks.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('job-status'), hashtext($1))", [jobId]);
        // Worker-specific lock keeps two requests for the same participant idempotent,
        // while other workers on the same job remain independent.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [jobId, uid]);

        const openResult = await client.query<OpenTimeLogRow>(
          `SELECT id, started_at
             FROM time_logs
            WHERE job_id = $1
              AND worker_id = $2
              AND stopped_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1`,
          [jobId, uid],
        );

        const openLog = openResult.rows[0] || null;
        if (openLog) {
          await client.query('COMMIT');
          return { alreadyStarted: true, startedAt: openLog.started_at };
        }

        const startedAt = new Date().toISOString();
        await client.query(
          `INSERT INTO time_logs (job_id, worker_id, started_at, start_lat, start_lng, start_accuracy)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [jobId, uid, startedAt, lat, lng, acc],
        );
        await client.query(`UPDATE jobs SET status = 'in_progress' WHERE id = $1`, [jobId]);
        await client.query('COMMIT');
        return { alreadyStarted: false, startedAt };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    if (result.alreadyStarted) {
      return NextResponse.json(
        { ok: true, already_started: true, started_at: result.startedAt },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true, started_at: result.startedAt }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
