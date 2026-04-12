// app/api/me/jobs/team/route.ts
import { NextResponse } from "next/server";
import { AppApiErrorCodes } from "@/lib/app-error-codes";
import { workerApiErrorResponse } from "@/lib/worker-api-response";
import { requireActiveWorker, toErrorResponse } from "@/lib/supabase-server";

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

export async function GET(req: Request) {
  try {
    const guard = await requireActiveWorker(req);
    const supabase = guard.supabase;
    const uid = guard.userId;

    const jobIds = new Set<string>();

    // 1) Jobs, где worker_id = uid
    const { data: directJobs, error: directErr } = await supabase.from("jobs").select("id").eq("worker_id", uid);
    if (directErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, directErr.message);
    for (const j of (directJobs as Array<{ id: string }> | null) || []) jobIds.add(j.id);

    // 2) Jobs, где worker в job_workers
    const { data: links, error: linksErr } = await supabase.from("job_workers").select("job_id").eq("worker_id", uid);
    if (linksErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, linksErr.message);
    for (const r of (links as Array<{ job_id: string | null }> | null) || []) {
      if (r.job_id) jobIds.add(r.job_id);
    }

    const ids = Array.from(jobIds);
    if (!ids.length) return NextResponse.json({ teams: {} }, { status: 200 });

    // Собираем worker_id по каждому job
    const byJob: Record<string, Set<string>> = {};
    for (const id of ids) byJob[id] = new Set<string>();

    const { data: jobs, error: jobsErr } = await supabase.from("jobs").select("id,worker_id").in("id", ids);
    if (jobsErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, jobsErr.message);
    for (const j of (jobs as unknown as JobRow[] | null) || []) {
      if (j && j.id && j.worker_id) byJob[j.id]?.add(j.worker_id);
    }

    const { data: jw, error: jwErr } = await supabase
      .from("job_workers")
      .select("job_id,worker_id,accepted_at")
      .in("job_id", ids);
    if (jwErr) return workerApiErrorResponse(400, AppApiErrorCodes.JOB_TEAM_QUERY_FAILED, jwErr.message);

    for (const r of (jw as unknown as JobWorkerRow[] | null) || []) {
      if (!r || !r.job_id || !r.worker_id) continue;
      byJob[r.job_id]?.add(r.worker_id);
    }

    // Собираем уникальные worker ids
    const workerIds = new Set<string>();
    for (const id of ids) for (const wid of byJob[id] || []) workerIds.add(wid);

    const profilesById: Record<string, ProfileRow> = {};
    const wids = Array.from(workerIds);

    for (const part of chunk(wids, 200)) {
      const { data: ps, error: pErr } = await supabase.from("profiles").select("id,full_name,email").in("id", part);
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
