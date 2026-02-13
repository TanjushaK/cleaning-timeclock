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

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data: sitesRaw, error: sErr } = await supabase
      .from('sites')
      .select('id, name, address, lat, lng, radius')
      .order('name', { ascending: true });

    if (sErr) throw new ApiError(500, 'Не смог прочитать sites');

    const sites = ((sitesRaw ?? []) as any[]).map((s) => ({
      id: String(s.id),
      name: s.name ?? null,
      address: s.address ?? null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      radius: s.radius ?? null,
    })) as SiteRow[];

    const siteIds = sites.map((s) => s.id).filter(Boolean);

    let rows: any[] = [];
    if (siteIds.length) {
      const { data: aRaw, error: aErr } = await supabase
        .from('assignments')
        .select('site_id, worker_id, extra_note, profiles:profiles(id, full_name, email, active, role)')
        .in('site_id', siteIds);

      if (aErr) throw new ApiError(500, 'Не смог прочитать assignments');
      rows = (aRaw ?? []) as any[];
    }

    const workersBySite = new Map<string, any[]>();
    for (const r of rows) {
      const sid = String(r.site_id ?? '');
      const p = r.profiles ?? null;
      if (!sid || !p?.id) continue;

      const list = workersBySite.get(sid) ?? [];
      list.push({
        id: String(p.id),
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        active: p.active ?? null,
        role: p.role ?? null,
        extra_note: r.extra_note ?? null,
      });
      workersBySite.set(sid, list);
    }

    const result = sites.map((s) => ({
      ...s,
      assigned_workers: workersBySite.get(s.id) ?? [],
    }));

    return NextResponse.json({ sites: result }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
