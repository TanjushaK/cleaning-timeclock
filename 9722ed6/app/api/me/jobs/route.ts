import { NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/supabase-server';

type JobRow = {
  id: string;
  site_id: string;
  worker_id: string;
  job_date: string | null;
  scheduled_time: string | null;
  status: string | null;
  created_at: string | null;
};

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);

    const { data: jobsRaw, error: jErr } = await supabase
      .from('jobs')
      .select('id, site_id, worker_id, job_date, scheduled_time, status, created_at')
      .eq('worker_id', userId)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (jErr) throw new ApiError(500, 'Не смог прочитать jobs');

    const jobs = (jobsRaw ?? []) as unknown as JobRow[];
    const siteIds = Array.from(new Set(jobs.map((j) => String(j.site_id)).filter(Boolean)));

    let sites: any[] = [];
    if (siteIds.length) {
      const { data: sRaw, error: sErr } = await supabase
        .from('sites')
        .select('id, name, address, lat, lng, radius')
        .in('id', siteIds);

      if (sErr) throw new ApiError(500, 'Не смог прочитать sites');
      sites = (sRaw ?? []) as any[];
    }

    let assigns: any[] = [];
    if (siteIds.length) {
      const { data: aRaw, error: aErr } = await supabase
        .from('assignments')
        .select('site_id, worker_id, extra_note')
        .eq('worker_id', userId)
        .in('site_id', siteIds);

      if (aErr) throw new ApiError(500, 'Не смог прочитать assignments');
      assigns = (aRaw ?? []) as any[];
    }

    const siteById = new Map<string, any>(sites.map((s) => [String(s.id), s]));
    const noteBySite = new Map<string, string | null>(assigns.map((a) => [String(a.site_id), a.extra_note ?? null]));

    const result = jobs.map((j) => {
      const site = siteById.get(String(j.site_id)) ?? null;
      return {
        id: String(j.id),
        site_id: String(j.site_id),
        worker_id: String(j.worker_id),
        job_date: j.job_date ?? null,
        scheduled_time: j.scheduled_time ?? null,
        status: j.status ?? 'planned',
        created_at: j.created_at ?? null,
        site: site
          ? {
              id: String(site.id),
              name: site.name ?? null,
              address: site.address ?? null,
              lat: site.lat ?? null,
              lng: site.lng ?? null,
              radius: site.radius ?? null,
            }
          : null,
        assignment_note: noteBySite.get(String(j.site_id)) ?? null,
      };
    });

    return NextResponse.json({ jobs: result }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
