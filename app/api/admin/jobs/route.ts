import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

type JobStatus = 'planned' | 'in_progress' | 'done' | string;

type JobRow = {
  id: string;
  site_id: string;
  worker_id: string;
  job_date: string | null;
  scheduled_time: string | null;
  status: JobStatus;
  created_at: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};

type WorkerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  active: boolean | null;
};

type SupaResult<T> = { data: T; error: any };

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let q = supabase
      .from('jobs')
      .select('id, site_id, worker_id, job_date, scheduled_time, status, created_at')
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (status && ['planned', 'in_progress', 'done'].includes(status)) {
      q = q.eq('status', status);
    }

    const { data: jobsRaw, error: jErr } = (await q) as SupaResult<JobRow[]>;
    if (jErr) throw new ApiError(500, 'Не смог прочитать jobs');

    const jobs = (jobsRaw ?? []) as JobRow[];

    const siteIds = Array.from(new Set(jobs.map((x) => String(x.site_id)).filter(Boolean)));
    const workerIds = Array.from(new Set(jobs.map((x) => String(x.worker_id)).filter(Boolean)));

    const [sitesRes, workersRes] = await Promise.all([
      siteIds.length
        ? (supabase
            .from('sites')
            .select('id, name, address, lat, lng, radius')
            .in('id', siteIds) as unknown as Promise<SupaResult<SiteRow[]>>)
        : (Promise.resolve({ data: [] as SiteRow[], error: null }) as Promise<SupaResult<SiteRow[]>>),

      workerIds.length
        ? (supabase
            .from('profiles')
            .select('id, full_name, email, active')
            .in('id', workerIds) as unknown as Promise<SupaResult<WorkerRow[]>>)
        : (Promise.resolve({ data: [] as WorkerRow[], error: null }) as Promise<SupaResult<WorkerRow[]>>),
    ]);

    if (sitesRes.error) throw new ApiError(500, 'Не смог прочитать sites (for jobs)');
    if (workersRes.error) throw new ApiError(500, 'Не смог прочитать profiles (for jobs)');

    const sites = (sitesRes.data ?? []) as SiteRow[];
    const workers = (workersRes.data ?? []) as WorkerRow[];

    const siteById = new Map<string, SiteRow>(sites.map((s) => [String(s.id), s]));
    const workerById = new Map<string, WorkerRow>(workers.map((w) => [String(w.id), w]));

    const result = jobs.map((j) => {
      const job: JobRow = {
        id: String(j.id),
        site_id: String(j.site_id),
        worker_id: String(j.worker_id),
        job_date: j.job_date ?? null,
        scheduled_time: j.scheduled_time ?? null,
        status: j.status ?? 'planned',
        created_at: j.created_at ?? null,
      };

      const site = siteById.get(job.site_id) ?? null;
      const worker = workerById.get(job.worker_id) ?? null;

      return {
        ...job,
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
        worker: worker
          ? {
              id: String(worker.id),
              full_name: worker.full_name ?? null,
              email: worker.email ?? null,
              active: worker.active ?? null,
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

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();

    const site_id = String(body?.site_id || '');
    const worker_id = String(body?.worker_id || '');
    const job_date = body?.job_date ? String(body.job_date) : null;
    const scheduled_time = body?.scheduled_time ? String(body.scheduled_time) : null;

    if (!site_id || !worker_id) throw new ApiError(400, 'Нужны site_id и worker_id');
    if (!job_date) throw new ApiError(400, 'Нужна дата (job_date)');
    if (!scheduled_time) throw new ApiError(400, 'Нужно время (scheduled_time)');

    const { error } = await supabase.from('jobs').insert({
      site_id,
      worker_id,
      job_date,
      scheduled_time,
      status: 'planned',
    });

    if (error) throw new ApiError(500, 'Не смог создать job');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();

    const id = String(body?.id || '');
    if (!id) throw new ApiError(400, 'Нужен id');

    const patch: Record<string, any> = {};
    if (body?.site_id) patch.site_id = String(body.site_id);
    if (body?.worker_id) patch.worker_id = String(body.worker_id);
    if (body?.job_date) patch.job_date = String(body.job_date);
    if (body?.scheduled_time) patch.scheduled_time = String(body.scheduled_time);
    if (body?.status) patch.status = String(body.status);

    const { error } = await supabase.from('jobs').update(patch).eq('id', id);
    if (error) throw new ApiError(500, 'Не смог обновить job');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();

    const id = String(body?.id || '');
    if (!id) throw new ApiError(400, 'Нужен id');

    const { error } = await supabase.from('jobs').delete().eq('id', id);
    if (error) throw new ApiError(500, 'Не смог удалить job');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
