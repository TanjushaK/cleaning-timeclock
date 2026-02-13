import { NextResponse } from 'next/server';
import { ApiError, requireAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req);

    const { data, error } = await supabase
      .from('assignments')
      .select('site_id, worker_id')
      .order('site_id', { ascending: true });

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

    const { error } = await supabase
      .from('assignments')
      .upsert({ site_id, worker_id }, { onConflict: 'site_id,worker_id' });

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

    const { error } = await supabase.from('assignments').delete().eq('site_id', site_id).eq('worker_id', worker_id);
    if (error) throw new ApiError(500, 'Не смог удалить assignment');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status });
  }
}
