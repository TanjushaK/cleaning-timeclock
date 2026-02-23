import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toErr(e: any) {
  const msg = String(e?.message || e || '');
  if (msg === 'UNAUTHORIZED') return { status: 401, error: 'Нужно войти' };
  if (msg === 'FORBIDDEN') return { status: 403, error: 'Нет доступа' };
  return { status: 500, error: msg || 'Ошибка сервера' };
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({} as any));
    const workerId = String(body?.worker_id || '').trim();
    const active = Boolean(body?.active);

    if (!workerId) {
      return NextResponse.json({ error: 'Нужен worker_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('profiles')
      .update({ active })
      .eq('id', workerId);

    if (error) {
      throw new Error(`Не смог обновить worker: ${error.message}`);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const r = toErr(e);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
}
