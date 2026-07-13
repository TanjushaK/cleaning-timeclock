import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  status: string | null
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time?: string