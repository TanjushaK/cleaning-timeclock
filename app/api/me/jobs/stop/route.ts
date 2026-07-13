// app/api/me/jobs/stop/route.ts
import { NextResponse } from 'next/server';
import { AppApiErrorCodes } from '@/lib/app-error-codes';
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StopBody = {
  jobId?: string;
  job_id?: string;
  id?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
};

type JobRow = {
  id: string;
  status: string | null;
  worker_id: string | null;
  site_id: string | null;
};

type SiteRow = { id: string; lat: number | null; lng: number | null; radius: number | null };
type JobWorkerRow = { job_id: string | null };
type TimeLogRow = { id: string; started_at: string | null };
type ParticipantRow = {