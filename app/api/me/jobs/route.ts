// app/api/me/jobs/route.ts
import { NextResponse } from 'next/server';
import { supabaseRouteClient } from '@/lib/supabase-route';

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

export async function GET() {
  const supabase = await supabaseRouteClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'Не авторизован.' }, { status: 401 });
  }

  const uid: string = auth.user.id;

  const { data: jw, error: jwErr } = await supabase
    .from('job_workers')
    .select('job_id')
    .eq('worker_id', uid);

  if (jwErr) {
    return NextResponse.json({ error: jwErr.message }, { status: 400 });
  }

  const jwRows: JobWorkerRow[] = (jw ?? []) as JobWorkerRow[];
  const ids: string[] = jwRows
    .map((x) => x.job_id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  let q = supabase
    .from('jobs')
    .select('id,title,job_date,scheduled_time,status,site:sites(id,name,lat,lng,radius)')
    .order('job_date', { ascending: true })
    .order('scheduled_time', { ascending: true });

  if (ids.length > 0) {
    q = q.or(`worker_id.eq.${uid},id.in.(${ids.join(',')})`);
  } else {
    q = q.eq('worker_id', uid);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ jobs: ((data ?? []) as unknown as JobRow[]) }, { status: 200 });
}
