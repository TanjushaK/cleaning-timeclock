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
};

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data: workers, error: wErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, active, avatar_url')
      .neq('role', 'admin')
      .order('full_name', { ascending: true });

    if (wErr) throw new ApiError(500, 'Не смог прочитать profiles');

    const { data: asg, error: aErr } = await supabase.from('assignments').select('site_id, worker_id');
    if (aErr) throw new ApiError(500, 'Не смог прочитать assignments');

    const siteIds = Array.from(new Set((asg ?? []).map((x: any) => String(x.site_id)).filter(Boolean)));

    let sites: SiteMini[] = [];
    if (siteIds.length > 0) {
      const { data: s, error: sErr } = await supabase.from('sites').select('id, name, address').in('id', siteIds);
      if (sErr) throw new ApiError(500, 'Не смог прочитать sites');
      sites = (s ?? []).map((x: any) => ({
        id: String(x.id),
        name: x.name ?? null,
        address: x.address ?? null,
      }));
    }

    const siteById = new Map(sites.map((s) => [s.id, s]));
    const sitesByWorker = new Map<string, SiteMini[]>();

    for (const a of asg ?? []) {
      const workerId = String((a as any).worker_id);
      const siteId = String((a as any).site_id);
      const site = siteById.get(siteId);
      if (!workerId || !site) continue;
      const arr = sitesByWorker.get(workerId) ?? [];
      arr.push(site);
      sitesByWorker.set(workerId, arr);
    }

    const result = (workers ?? []).map((w: any) => {
      const row: WorkerRow = {
        id: String(w.id),
        full_name: w.full_name ?? null,
        email: w.email ?? null,
        role: w.role ?? null,
        active: w.active ?? null,
        avatar_url: w.avatar_url ?? null,
      };

      return {
        ...row,
        assigned_sites: sitesByWorker.get(row.id) ?? [],
      };
    });

    return NextResponse.json({ workers: result }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
