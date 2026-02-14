import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type SiteRow = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  notes: string | null;
  photo_url: string | null;
  archived_at: string | null;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

function bearerToken(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAdmin(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return { ok: false as const, res: NextResponse.json({ error: 'Нет токена' }, { status: 401 }) };
  }

  const supabase = getSupabaseAdmin();

  const { data: u, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !u?.user) {
    return { ok: false as const, res: NextResponse.json({ error: 'Недействительный токен' }, { status: 401 }) };
  }

  const userId = u.user.id;

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', userId)
    .maybeSingle();

  if (pErr) {
    return { ok: false as const, res: NextResponse.json({ error: 'Ошибка профиля' }, { status: 500 }) };
  }

  if (!profile || profile.active === false || profile.role !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true as const, supabase, userId };
}

function jsonErr(e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : 'Ошибка';
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;

    const { data, error } = await guard.supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius_m,notes,photo_url,archived_at')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 });

    return NextResponse.json({ site: data as SiteRow }, { status: 200 });
  } catch (e) {
    return jsonErr(e, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({} as any));

    const update: Partial<SiteRow> = {};

    if (typeof body.name === 'string') update.name = body.name.trim();
    if (typeof body.address === 'string') update.address = body.address.trim();
    if (body.address === null) update.address = null;

    if (typeof body.lat === 'number' || body.lat === null) update.lat = body.lat;
    if (typeof body.lng === 'number' || body.lng === null) update.lng = body.lng;

    if (typeof body.radius_m === 'number' || body.radius_m === null) update.radius_m = body.radius_m;

    if (typeof body.notes === 'string') update.notes = body.notes.trim();
    if (body.notes === null) update.notes = null;

    if (typeof body.photo_url === 'string') update.photo_url = body.photo_url.trim();
    if (body.photo_url === null) update.photo_url = null;

    if (typeof body.archived_at === 'string' || body.archived_at === null) update.archived_at = body.archived_at;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 });
    }

    const { data, error } = await guard.supabase
      .from('sites')
      .update(update)
      .eq('id', id)
      .select('id,name,address,lat,lng,radius_m,notes,photo_url,archived_at')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 });

    return NextResponse.json({ site: data as SiteRow }, { status: 200 });
  } catch (e) {
    return jsonErr(e, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return guard.res;

    const { id } = await ctx.params;

    const { data, error } = await guard.supabase
      .from('sites')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius_m,notes,photo_url,archived_at')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Объект не найден' }, { status: 404 });

    return NextResponse.json({ site: data as SiteRow }, { status: 200 });
  } catch (e) {
    return jsonErr(e, 500);
  }
}
