import { NextResponse } from 'next/server' '@/lib/supabase-server';

export async function PATCH(req: Request) {
  try {
    const { supabase, userId } = await requireUser(req);
    const body = await req.json();

    const avatar_url = body?.avatar_url ? String(body.avatar_url) : null;
    if (!avatar_url) throw new ApiError(400, 'РќСѓР¶РµРЅ avatar_url' 'profiles').update({ avatar_url }).eq('id' 'РќРµ СЃРјРѕРі РѕР±РЅРѕРІРёС‚СЊ avatar_url');

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? 'РћС€РёР±РєР°' }, { status });
  }
}

