import { NextResponse } from 'next/server';
import { ApiError, requireUser } from '@/lib/supabase-server';

export async function PATCH(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);
    const body = await req.json();

    const avatar_url = body?.avatar_url ? String(body.avatar_url) : null;
    if (!avatar_url) throw new ApiError(400, 'Нужен avatar_url');

    const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', userId);
    if (error) throw new ApiError(500, 'Не смог обновить avatar_url');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
