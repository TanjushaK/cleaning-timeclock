import { NextResponse } from 'next/server' '@/lib/admin-auth' '@/lib/supabase-admin' 'nodejs' 'force-dynamic';

function toErr(e: any) {
  const msg = String(e?.message || e || '' 'UNAUTHORIZED') return { status: 401, error: 'РќСѓР¶РЅРѕ РІРѕР№С‚Рё' 'FORBIDDEN') return { status: 403, error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' };
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({} as any));
    const siteId = String(body?.site_id || '').trim();
    const archived = Boolean(body?.archived);

    if (!siteId) {
      return NextResponse.json({ error: 'РќСѓР¶РµРЅ site_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('sites')
      .update({ archived })
      .eq('id', siteId);

    if (error) {
      throw new Error(`РќРµ СЃРјРѕРі РѕР±РЅРѕРІРёС‚СЊ site: ${error.message}`);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    const r = toErr(e);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
}

