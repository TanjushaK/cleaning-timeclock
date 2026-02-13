import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

type WorkerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
  avatar_url: string | null;
};

type SiteMini = {
  id: string;
  name: string | null;
  address: string | null;
  extra_note: string | null;
};

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data: workersRaw, error: wErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, active, avatar_url')
      .order('full_name', { ascending: true });

    if (wErr) throw new ApiError(500, 'Не смог прочитать profiles');

    const workers = ((workersRaw ?? []) as any[]).map((w) => ({
      id: String(w.id),
      full_name: w.full_name ?? null,
      email: w.email ?? null,
      role: w.role ?? null,
      active: w.active ?? null,
      avatar_url: w.avatar_url ?? null,
    })) as WorkerRow[];

    const ids = workers.map((w) => String(w.id)).filter(Boolean);

    let assignedRows: any[] = [];
    if (ids.length) {
      const { data: aRaw, error: aErr } = await supabase
        .from('assignments')
        .select('worker_id, site_id, extra_note, sites:sites(id, name, address)')
        .in('worker_id', ids);

      if (aErr) throw new ApiError(500, 'Не смог прочитать assignments');
      assignedRows = (aRaw ?? []) as any[];
    }

    const sitesByWorker = new Map<string, SiteMini[]>();

    for (const r of assignedRows) {
      const workerId = String(r.worker_id ?? '');
      if (!workerId) continue;

      const sitesValue = r.sites ?? null;
      const siteObj = Array.isArray(sitesValue) ? (sitesValue[0] ?? null) : sitesValue;
      if (!siteObj?.id) continue;

      const site: SiteMini = {
        id: String(siteObj.id),
        name: siteObj.name ?? null,
        address: siteObj.address ?? null,
        extra_note: r.extra_note ?? null,
      };

      const list = sitesByWorker.get(workerId) ?? [];
      list.push(site);
      sitesByWorker.set(workerId, list);
    }

    const result = workers.map((w) => ({
      ...w,
      assigned_sites: sitesByWorker.get(String(w.id)) ?? [],
    }));

    return NextResponse.json({ workers: result }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
