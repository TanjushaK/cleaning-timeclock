// app/api/me/jobs/team/route.ts
import { NextResponse } from "next/server";
import { AppApiErrorCodes } from "@/lib/app-error-codes";
import { workerApiErrorResponse } from "@/lib/worker-api-response";
import { requireActiveWorker, toErrorResponse } from "@/lib/route-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type JobWorkerRow = {
  job_id: string | null;
  worker_id: string | null;
  accepted_at?: string | null;
};

type JobRow = {
  id: string;
  worker_id: string | null;
  job_date?: string | null;
  site_id?: string | null;
  scheduled_time?: string | null;
  scheduled_end_time?: string | null;
  status?: string | null;
};

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function displayName(p: ProfileRow | undefined, fallbackId: string) {
  const name = (p?.full_name || "").trim();
  if (name) return name;
  const email = (p?.email || "").trim();
  if (email) return email;
  return fallbackId.slice(0, 8);
}

function shiftKey(job: Pick<JobRow, "job_date" | "site_id" | "scheduled_time" | "scheduled_end_time">) {
  return [
    String(job.job_date || ""),
    String(job.site_id || ""),
    String(job.scheduled_time || ""),
    String(job.scheduled_end_time || ""),
  ].join("|");
}

function isCancelledStatus(status: string | null | undefined) {
  const s = String(status || "").trim().toLowerCase();
  return s === "cancelled" || s === "canceled";
}

export async function GET(req: Request) {
  try {
    const guard = await requireActiveWorker(req);
    const db = guard.db;
    const uid = guard.userId;

    const jobIds = new Set<string>();

    // 1) Jobs, где worker_id = uid
    const { data: directJobs, error: directErr } = await db.from("jobs").select("id").eq("worker_id", uid);
    if (directErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, directErr.message);
    for (const j of (directJobs as Array<{ id: string }> | null) || []) jobIds.add(j.id);

    // 2) Jobs, где worker в job_workers
    const { data: links, error: linksErr } = await db.from("job_workers").select("job_id").eq("worker_id", uid);
    if (linksErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, linksErr.message);
    for (const r of (links as Array<{ job_id: string | null }> | null) || []) {
      if (r.job_id) jobIds.add(r.job_id);
    }

    const ids = Array.from(jobIds);
    if (!ids.length) return NextResponse.json({ teams: {} }, { status: 200 });

    // Собираем worker_id по каждому job
    const byJob: Record<string, Set<string>> = {};
    for (const id of ids) byJob[id] = new Set<string>();

    let jobs: JobRow[] = [];
    {
      const { data, error } = await db
        .from("jobs")
        .select("id,worker_id,job_date,site_id,scheduled_time,scheduled_end_time,status")
        .in("id", ids);
      if (error && String(error.message || "").toLowerCase().includes("scheduled_end_time")) {
        const { data: d2, error: e2 } = await db
          .from("jobs")
          .select("id,worker_id,job_date,site_id,scheduled_time,status")
          .in("id", ids);
        if (e2) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, e2.message);
        jobs = (d2 as unknown as JobRow[] | null) || [];
      } else {
        if (error) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, error.message);
        jobs = (data as unknown as JobRow[] | null) || [];
      }
    }
    for (const j of jobs || []) {
      if (j && j.id && j.worker_id) byJob[j.id]?.add(j.worker_id);
    }

    const { data: jw, error: jwErr } = await db
      .from("job_workers")
      .select("job_id,worker_id,accepted_at")
      .in("job_id", ids);
    if (jwErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, jwErr.message);

    for (const r of (jw as unknown as JobWorkerRow[] | null) || []) {
      if (!r || !r.job_id || !r.worker_id) continue;
      byJob[r.job_id]?.add(r.worker_id);
    }

    // Extend team composition with sibling jobs representing the same shift identity:
    // same date + site + start + end (when available). This keeps old same-job logic
    // and adds coworker discovery for schedules split into separate job rows.
    const baseJobs = (jobs || []).filter((j) => j && j.id);
    const siteIds = Array.from(new Set(baseJobs.map((j) => String(j.site_id || "")).filter(Boolean)));
    const dates = baseJobs.map((j) => String(j.job_date || "")).filter(Boolean);
    const minDate = dates.length ? dates.slice().sort()[0] : null;
    const maxDate = dates.length ? dates.slice().sort().reverse()[0] : null;

    if (siteIds.length && minDate && maxDate) {
      let pool: JobRow[] = [];
      {
        const { data, error } = await db
          .from("jobs")
          .select("id,worker_id,job_date,site_id,scheduled_time,scheduled_end_time,status")
          .in("site_id", siteIds)
          .gte("job_date", minDate)
          .lte("job_date", maxDate);

        if (error && String(error.message || "").toLowerCase().includes("scheduled_end_time")) {
          const { data: d2, error: e2 } = await db
            .from("jobs")
            .select("id,worker_id,job_date,site_id,scheduled_time,status")
            .in("site_id", siteIds)
            .gte("job_date", minDate)
            .lte("job_date", maxDate);
          if (e2) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, e2.message);
          pool = (d2 as unknown as JobRow[] | null) || [];
        } else {
          if (error) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, error.message);
          pool = (data as unknown as JobRow[] | null) || [];
        }
      }

      const activePool = pool.filter((j) => !isCancelledStatus(j.status));
      const byShift = new Map<string, JobRow[]>();
      for (const j of activePool) {
        if (!j?.id || !j.job_date || !j.site_id || !j.scheduled_time) continue;
        const key = shiftKey(j);
        const arr = byShift.get(key) || [];
        arr.push(j);
        byShift.set(key, arr);
      }

      const siblingToCurrent = new Map<string, Set<string>>();
      for (const current of baseJobs) {
        if (!current?.id || !current.job_date || !current.site_id || !current.scheduled_time) continue;
        const sibs = byShift.get(shiftKey(current)) || [];
        for (const sib of sibs) {
          if (!sib?.id) continue;
          if (sib.worker_id) byJob[current.id]?.add(sib.worker_id);
          const curSet = siblingToCurrent.get(sib.id) || new Set<string>();
          curSet.add(current.id);
          siblingToCurrent.set(sib.id, curSet);
        }
      }

      const siblingIds = Array.from(siblingToCurrent.keys());
      if (siblingIds.length) {
        for (const part of chunk(siblingIds, 200)) {
          const { data: sjw, error: sjwErr } = await db
            .from("job_workers")
            .select("job_id,worker_id,accepted_at")
            .in("job_id", part);
          if (sjwErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, sjwErr.message);
          for (const r of (sjw as unknown as JobWorkerRow[] | null) || []) {
            if (!r?.job_id || !r?.worker_id) continue;
            const currentIds = siblingToCurrent.get(r.job_id);
            if (!currentIds) continue;
            for (const cid of currentIds) byJob[cid]?.add(r.worker_id);
          }
        }
      }
    }

    // Собираем уникальные worker ids
    const workerIds = new Set<string>();
    for (const id of ids) for (const wid of byJob[id] || []) workerIds.add(wid);

    const profilesById: Record<string, ProfileRow> = {};
    const wids = Array.from(workerIds);

    for (const part of chunk(wids, 200)) {
      const { data: ps, error: pErr } = await db.from("profiles").select("id,full_name,email").in("id", part);
      if (pErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, pErr.message);
      for (const p of (ps as unknown as ProfileRow[] | null) || []) {
        if (p && p.id) profilesById[p.id] = p;
      }
    }

    const teams: Record<string, Array<{ id: string; name: string }>> = {};

    for (const id of ids) {
      const xs = Array.from(byJob[id] || []);
      teams[id] = xs.map((wid) => ({
        id: wid,
        name: displayName(profilesById[wid], wid),
      }));
    }

    // Не убираем uid на сервере — клиент может показать/скрыть сам.
    return NextResponse.json({ teams }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
