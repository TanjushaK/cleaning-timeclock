import { NextResponse } from "next/server";
import type { AppApiErrorCode } from "@/lib/app-error-codes";

/** Stable JSON error for `/api/auth/*` and `/api/me/*` (worker i18n via `errors.api.<errorCode>`). */
export function workerApiErrorResponse(status: number, errorCode: AppApiErrorCode, error?: string) {
  const body: Record<string, string> = { errorCode };
  if (error) body.error = error;
  return NextResponse.json(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
