// app/api/me/jobs/route.ts
import { NextResponse } from 'next/server';
import { requireUser, toErrorResponse } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SiteRow = {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};

type JobRow = {
  id: string;
  title: string | null;
  job_date: string | null;
  scheduled_time: string | null;
  status: string | null;
  site: SiteRow | null;
};

type JobWorkerRow = {
  job_id: string | null;
};

export async function GET(req: Request) {
  try {
    const guard = await requireUser(req);
    const supabase = guard.supabase;
    const uid = guard.userId;

    const { data: jw, error: jwErr } = await supabase.from('job_workers').select('job_id').eq('worker_id', uid);
    if (jwErr) return NextResponse.json({ error: jwErr.message }, { status: 400 });

    const ids: string[] = ((jw ?? []) as JobWorkerRow[])
      .map((x) => x.job_id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

    const select = 'id,title,job_date,scheduled_time,status,site:sites(id,name,lat,lng,radius)';

    const { data: directJobs, error: dErr } = await supabase
      .from('jobs')
      .select(select)
      .eq('worker_id', uid)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    let extraJobs: JobRow[] = [];
    if (ids.length > 0) {
      const { data: extra, error: eErr } = await supabase
        .from('jobs')
        .select(select)
        .in('id', ids)
        .order('job_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
      extraJobs = (extra ?? []) as unknown as JobRow[];
    }

    const map = new Map<string, JobRow>();
    for (const j of (directJobs ?? []) as unknown as JobRow[]) map.set(j.id, j);
    for (const j of extraJobs) map.set(j.id, j);

    const jobs = Array.from(map.values()).sort((a, b) => {
      const da = a.job_date ?? '';
      const db = b.job_date ?? '';
      if (da !== db) return da.localeCompare(db);
      const ta = a.scheduled_time ?? '';
      const tb = b.scheduled_time ?? '';
      return ta.localeCompare(tb);
    });

    return NextResponse.json({ jobs }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
