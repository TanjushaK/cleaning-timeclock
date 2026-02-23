// app/api/admin/workers/anonymize/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, supabaseService, toErrorResponse } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const workerId = String(body?.worker_id || '').trim()
    if (!workerId) throw new ApiError(400, 'worker_id обязателен')

    if (workerId === guard.userId) {
      throw new ApiError(409, 'Нельзя удалить самого себя.')
    }

    const admin = supabaseService()

    // 0) нельзя трогать админа
    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', workerId)
      .maybeSingle()

    if (profErr || !prof) throw new ApiError(404, 'Профиль не найден')
    if (prof.role === 'admin') throw new ApiError(409, 'Админа удалить нельзя')

    // 1) снимаем назначения (объекты)
    const { error: asErr } = await admin.from('assignments').delete().eq('worker_id', workerId)
    if (asErr) throw new ApiError(500, asErr.message)

    // 2) анонимизируем профиль (история смен/таймлогов останется)
    const patch: any = {
      active: false,
      role: 'worker',
      full_name: 'Удалённый работник',
      phone: null,
      avatar_url: null,
    }

    const { error: updErr } = await admin.from('profiles').update(patch).eq('id', workerId)
    if (updErr) throw new ApiError(500, updErr.message)

    // 3) удаляем auth user (отзываем доступ). Если уже удалён — считаем успехом.
    const { error: authErr } = await admin.auth.admin.deleteUser(workerId)
    if (authErr) {
      const msg = String(authErr.message || '')
      const notFound = /not\s*found/i.test(msg) || /User\s*not\s*found/i.test(msg)
      if (!notFound) {
        return NextResponse.json(
          { ok: true, warning: `Профиль анонимизирован, но auth user не удалён: ${msg}` },
          { status: 200 }
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
