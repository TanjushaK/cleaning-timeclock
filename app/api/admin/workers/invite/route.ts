import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

function getOrigin(req: Request) {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) return `${proto}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, admin } = await requireAdmin(req);
    const body = await req.json();

    const email = (body?.email ?? '').toString().trim().toLowerCase();
    const full_name = body?.full_name == null ? null : String(body.full_name).trim() || null;

    if (!email) throw new ApiError(400, 'Нужен email');

    const origin = getOrigin(req);
    const redirectTo = origin ? `${origin}/reset-password` : undefined;

    const { data, error } = await admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) throw new ApiError(500, error.message || 'Не смог отправить приглашение');

    const userId = data?.user?.id;
    if (!userId) throw new ApiError(500, 'Invite: нет user id');

    const { error: pErr } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, email, full_name, role: 'worker', active: true },
        { onConflict: 'id' }
      );

    if (pErr) throw new ApiError(500, 'Invite: не смог обновить profiles');

    return NextResponse.json({ ok: true, userId }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
