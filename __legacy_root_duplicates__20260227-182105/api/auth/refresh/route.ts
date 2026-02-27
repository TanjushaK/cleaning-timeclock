import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? '').replace(/^\uFEFF/, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function mustEnv(name: string): string {
  const v = cleanEnv(process.env[name])
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function json(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const refresh_token = String(body?.refresh_token || '').trim()
    if (!refresh_token) return json(400, { error: 'refresh_token обязателен' })

    const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anon = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // NOTE: Supabase JS v2 supports refreshSession({ refresh_token })
    const { data, error } = await (supabase as any).auth.refreshSession({ refresh_token })
    if (error || !data?.session) return json(401, { error: error?.message || 'Не удалось обновить сессию' })

    return json(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    })
  } catch (e: any) {
    return json(500, { error: String(e?.message || e) })
  }
}


