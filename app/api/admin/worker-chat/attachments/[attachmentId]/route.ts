import { NextRequest, NextResponse } from 'next/server'

import { adminChatPhotoBucket } from '@/lib/server/worker-admin-chat-media'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { db } = await requireAdmin(req)
    const { attachmentId: raw } = await ctx.params
    const attachmentId = String(raw || '').trim()
    if (!attachmentId) throw new ApiError(400, 'attachment id required', AdminApiErrorCode.DB_ERROR)

    const { data: att, error: attErr } = await db
      .from('worker_admin_message_attachments')
      .select('id, message_id, path')
      .eq('id', attachmentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (attErr) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)
    if (!att) throw new ApiError(404, 'Attachment not found')

    const messageId = String((att as { message_id?: string }).message_id || '')
    if (!messageId) throw new ApiError(404, 'Attachment not found')

    const { data: msg, error: msgErr } = await db
      .from('worker_admin_messages')
      .select('id')
      .eq('id', messageId)
      .is('deleted_at', null)
      .maybeSingle()

    if (msgErr) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)
    if (!msg) throw new ApiError(404, 'Attachment not found')

    const objectPath = String((att as { path?: string }).path || '').trim()
    if (objectPath) {
      const bucketClient = adminChatPhotoBucket()
      await bucketClient.remove([objectPath])
    }

    const { error: updErr } = await db
      .from('worker_admin_message_attachments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', attachmentId)
      .is('deleted_at', null)

    if (updErr) throw new ApiError(400, 'Request failed', AdminApiErrorCode.DB_ERROR)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { db } = await requireAdmin(_req)
    const { attachmentId: raw } = await ctx.params
    const attachmentId = String(raw || '').trim()
    if (!attachmentId) throw new ApiError(400, 'attachment id required', AdminApiErrorCode.DB_ERROR)

    const { data: att, error: attErr } = await db
      .from('worker_admin_message_attachments')
      .select('id, message_id, path, mime_type')
      .eq('id', attachmentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (attErr) throw new ApiError(400, attErr.message, AdminApiErrorCode.DB_ERROR)
    if (!att) throw new ApiError(404, 'Attachment not found')

    const messageId = String((att as { message_id?: string }).message_id || '')
    if (!messageId) throw new ApiError(404, 'Attachment not found')

    const { data: msg, error: msgErr } = await db
      .from('worker_admin_messages')
      .select('id')
      .eq('id', messageId)
      .is('deleted_at', null)
      .maybeSingle()

    if (msgErr) throw new ApiError(400, msgErr.message, AdminApiErrorCode.DB_ERROR)
    if (!msg) throw new ApiError(404, 'Attachment not found')

    const objectPath = String((att as { path?: string }).path || '').trim()
    if (!objectPath) throw new ApiError(404, 'Attachment not found')

    const bucketClient = adminChatPhotoBucket()
    const { data: blob, error: dlErr } = await bucketClient.download(objectPath)
    if (dlErr || !blob) throw new ApiError(404, 'Attachment not found')

    const mimeHeader =
      String((att as { mime_type?: string | null }).mime_type || '').trim() ||
      (typeof blob.type === 'string' && blob.type ? blob.type : '') ||
      'application/octet-stream'

    const buf = Buffer.from(await blob.arrayBuffer())

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': mimeHeader,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
