import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Нужны email и пароль' }, { status: 400 })
    }

    const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anon = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.session) {
      return NextResponse.json({ error: error?.message || 'Login failed' }, { status: 401 })
    }

    const access_token = data.session.access_token
    const refresh_token = data.session.refresh_token

    // Важно: cookies нужны для запросов с FormData (где часто забывают Authorization header).
    const res = NextResponse.json({ access_token, refresh_token }, { status: 200 })

    // Localhost: secure=false, иначе cookie не сохранится.
    // SameSite=Lax достаточно для same-origin запросов.
    res.cookies.set('ct_access_token', access_token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1h
    })
    res.cookies.set('ct_refresh_token', refresh_token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30d
    })

    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
