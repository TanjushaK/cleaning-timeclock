import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

type SiteRow = {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};

type WorkerMini = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data: sites, error: sitesErr } = await supabase
      .from('sites')
      .select('id, name, address, lat, lng, radius')
      .order('name', { ascending: true });

    if (sitesErr) throw new ApiError(500, 'Не смог прочитать sites');

    const { data: asg, error: asgErr } = await supabase
      .from('assignments')
      .select('site_id, worker_id');

    if (asgErr) throw new ApiError(500, 'Не смог прочитать assignments');

    const workerIds = Array.from(new Set((asg ?? []).map((x: any) => String(x.worker_id)).filter(Boolean)));

    let workers: WorkerMini[] = [];
    if (workerIds.length > 0) {
      const { data: w, error: wErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', workerIds);

      if (wErr) throw new ApiError(500, 'Не смог прочитать profiles (workers)');
      workers = (w ?? []).map((x: any) => ({
        id: String(x.id),
        full_name: x.full_name ?? null,
        email: x.email ?? null,
      }));
    }

    const workerById = new Map(workers.map((w) => [w.id, w]));
    const workersBySite = new Map<string, WorkerMini[]>();

    for (const a of asg ?? []) {
      const siteId = String((a as any).site_id);
      const workerId = String((a as any).worker_id);
      const worker = workerById.get(workerId);
      if (!siteId || !worker) continue;
      const arr = workersBySite.get(siteId) ?? [];
      arr.push(worker);
      workersBySite.set(siteId, arr);
    }

    const result = (sites ?? []).map((s: any) => {
      const row: SiteRow = {
        id: String(s.id),
        name: s.name ?? null,
        address: s.address ?? null,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        radius: s.radius ?? null,
      };

      return {
        ...row,
        assigned_workers: workersBySite.get(row.id) ?? [],
      };
    });

    return NextResponse.json({ sites: result }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
