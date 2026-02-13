import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data, error } = await supabase
      .from('assignments')
      .select('site_id, worker_id, extra_note, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw new ApiError(500, 'Не смог прочитать assignments');

    return NextResponse.json({ assignments: data ?? [] }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();

    const site_id = String(body?.site_id || '');
    const worker_id = String(body?.worker_id || '');
    if (!site_id || !worker_id) throw new ApiError(400, 'Нужны site_id и worker_id');

    const payload: any = {
      site_id,
      worker_id,
      updated_at: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(body, 'extra_note')) {
      payload.extra_note = body.extra_note == null ? null : String(body.extra_note);
    }

    const { error } = await supabase
      .from('assignments')
      .upsert(payload, { onConflict: 'site_id,worker_id' });

    if (error) throw new ApiError(500, 'Не смог сохранить assignment');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json();

    const site_id = String(body?.site_id || '');
    const worker_id = String(body?.worker_id || '');
    if (!site_id || !worker_id) throw new ApiError(400, 'Нужны site_id и worker_id');

    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('site_id', site_id)
      .eq('worker_id', worker_id);

    if (error) throw new ApiError(500, 'Не смог удалить assignment');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
