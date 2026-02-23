import { NextResponse } from 'next/server' '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireActiveWorker(req);
    const body = await req.json();

    const site_id = String(body?.site_id || '' '' 'РќСѓР¶РµРЅ site_id');

    const { data: row, error: rErr } = await supabase
      .from('assignments' 'site_id, worker_id' 'site_id' 'worker_id', userId)
      .maybeSingle();

    if (rErr) throw new ApiError(500, 'РќРµ СЃРјРѕРі РїСЂРѕС‡РёС‚Р°С‚СЊ assignment' 'РќРµС‚ РЅР°Р·РЅР°С‡РµРЅРёСЏ РЅР° СЌС‚РѕС‚ РѕР±СЉРµРєС‚');

    const { error: uErr } = await supabase
      .from('assignments')
      .update({ extra_note, updated_at: new Date().toISOString() })
      .eq('site_id' 'worker_id' 'РќРµ СЃРјРѕРі СЃРѕС…СЂР°РЅРёС‚СЊ Р·Р°РјРµС‚РєСѓ');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'РћС€РёР±РєР°' }, { status });
  }
}



