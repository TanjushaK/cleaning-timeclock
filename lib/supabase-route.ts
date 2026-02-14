// lib/supabase-route.ts
//
// Раньше тут был Supabase SSR клиент через cookies() и @supabase/ssr.
// Сейчас проект переведён на Bearer-токен (Authorization: Bearer ...),
// поэтому route handlers используют requireUser/requireAdmin из lib/supabase-server.ts.
//
// Оставляем этот файл как совместимый хелпер (на случай старых импортов),
// но без зависимостей на @supabase/ssr, чтобы сборка была зелёной.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export async function supabaseRouteClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
