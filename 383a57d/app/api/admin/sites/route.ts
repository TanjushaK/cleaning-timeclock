import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();

    const name = (body?.name ?? '').toString().trim();
    const address = body?.address == null ? null : String(body.address).trim() || null;

    const lat = body?.lat == null ? null : Number(body.lat);
    const lng = body?.lng == null ? null : Number(body.lng);
    const radius = body?.radius == null ? null : Number(body.radius);

    if (!name) throw new ApiError(400, 'Нужно название объекта');

    const safeLat = lat != null && Number.isFinite(lat) ? lat : null;
    const safeLng = lng != null && Number.isFinite(lng) ? lng : null;
    const safeRadius = radius != null && Number.isFinite(radius) ? radius : 150;

    const { data, error } = await supabase
      .from('sites')
      .insert({
        name,
        address,
        lat: safeLat,
        lng: safeLng,
        radius: safeRadius,
      })
      .select('id, name, address, lat, lng, radius')
      .single();

    if (error) throw new ApiError(500, error.message || 'Не смог создать объект');

    return NextResponse.json({ site: data }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
