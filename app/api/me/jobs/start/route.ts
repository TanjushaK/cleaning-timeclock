// app/api/me/jobs/start/route.ts
import { NextResponse } from 'next/server';
import { AppApiErrorCodes } from '@/lib/app-error-codes';
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db';

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

/** Default site check-in radius (m), aligned with admin new-site default when DB radius is unset. */
const DEFAULT_CHECKIN_RADIUS_M = 150;

function normalizeSiteEmbed(raw: unknown): { lat: number | null; lng: number | null; radius: number | null } | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  return {
    lat: toNum(o.lat),
    lng: toNum(o.lng),
    radius: toNum(o.radius),
  };
}

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

    const job = jobRaw as unknown as JobRow;

    if (job.status !== 'planned') {
      throw new ApiError(400, 'Invalid job status for start', AppApiErrorCodes.JOB_START_STATUS_INVALID);
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

    const siteId = String(job.site_id || '').trim();
    if (!siteId) throw new ApiError(400, 'site_id missing', AppApiErrorCodes.JOB_SITE_ID_MISSING);

    // Same source as GET /api/me/jobs: explicit sites row (embed site:sites(...) often returns null under worker RLS).
    const { data: siteRow, error: siteErr } = await db.from('sites').select('lat,lng,radius').eq('id', siteId).maybeSingle();

    if (siteErr) throw new ApiError(400, siteErr.message, AppApiErrorCodes.JOB_LIST_QUERY_FAILED);

    const site = normalizeSiteEmbed(siteRow);
    if (!site || site.lat === null || site.lng === null) {
      throw new ApiError(400, 'Site coordinates missing', AppApiErrorCodes.SITE_COORDINATES_MISSING);
    }

    const radius = site.radius != null && site.radius > 0 ? site.radius : DEFAULT_CHECKIN_RADIUS_M;

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

    const startedAt = new Date().toISOString();

    const { error: insErr } = await db.from('time_logs').insert({
      job_id: jobId,
      worker_id: uid,
      started_at: startedAt,
      start_lat: lat,
      start_lng: lng,
      start_accuracy: acc,
    });

    if (insErr) throw new ApiError(400, insErr.message, AppApiErrorCodes.JOB_ACCEPT_UPDATE_FAILED);

    const { error: updErr } = await db.from('jobs').update({ status: 'in_progress' }).eq('id', jobId);
    if (updErr) throw new ApiError(400, updErr.message, AppApiErrorCodes.JOB_ACCEPT_UPDATE_FAILED);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}


