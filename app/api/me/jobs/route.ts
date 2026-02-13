import { NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/supabase-server';

export async function GET(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let q = supabase
      .from('jobs')
      .select('id, site_id, worker_id, job_date, scheduled_time, status, created_at')
      .eq('worker_id', userId)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (status && ['planned', 'in_progress', 'done'].includes(status)) {
      q = q.eq('status', status);
    }

    const { data: jobs, error: jErr } = await q;
    if (jErr) throw new ApiError(500, 'Не смог прочитать jobs');

    const siteIds = Array.from(new Set((jobs ?? []).map((x: any) => String(x.site_id)).filter(Boolean)));

    const { data: sites, error: sErr } = siteIds.length
      ? await supabase.from('sites').select('id, name, address, lat, lng, radius').in('id', siteIds)
      : { data: [], error: null };

    if (sErr) throw new ApiError(500, 'Не смог прочитать sites');

    const siteById = new Map((sites ?? []).map((s: any) => [String(s.id), s]));

    const result = (jobs ?? []).map((j: any) => {
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
      };
    });

    return NextResponse.json({ jobs: result }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
