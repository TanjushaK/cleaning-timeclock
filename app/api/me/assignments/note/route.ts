import { NextResponse } from 'next/server';
import { ApiError, requireActiveWorker } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireActiveWorker(req);
    const body = await req.json();

    const site_id = String(body?.site_id || '');
    const extra_note = body?.extra_note == null ? '' : String(body.extra_note);

    if (!site_id) throw new ApiError(400, 'Нужен site_id');

    const { data: row, error: rErr } = await supabase
      .from('assignments')
      .select('site_id, worker_id')
      .eq('site_id', site_id)
      .eq('worker_id', userId)
      .maybeSingle();

    if (rErr) throw new ApiError(500, 'Не смог прочитать assignment');
    if (!row) throw new ApiError(403, 'Нет назначения на этот объект');

    const { error: uErr } = await supabase
      .from('assignments')
      .update({ extra_note, updated_at: new Date().toISOString() })
      .eq('site_id', site_id)
      .eq('worker_id', userId);

    if (uErr) throw new ApiError(500, 'Не смог сохранить заметку');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}


