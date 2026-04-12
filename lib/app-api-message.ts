import { FetchApiError } from "@/lib/fetch-api-error";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Map API `{ error, errorCode }` to `t("errors.api.<code>")` — worker/user UI (not admin namespaces). */
function messageFromApiPayload(
  t: TFn,
  payload: { error?: string; errorCode?: string },
): string {
  const code = payload.errorCode;
  if (code) {
    const key = `errors.api.${code}`;
    const m = t(key);
    if (m !== key) return m;
  }
  return payload.error || t("error.generic");
}

/** Map FetchApiError (errorCode + English fallback) to a localized string. */
export function clientApiErrorMessage(t: TFn, e: unknown): string {
  if (e instanceof FetchApiError) {
    return messageFromApiPayload(t, { error: e.message, errorCode: e.errorCode });
  }
  return String((e as Error)?.message ?? e);
}

/**
 * Worker/home UI: JSON API errors (`errorCode` → `errors.api.*`) plus Supabase Auth `{ code }`
 * → `errors.supabase.*`. Does not surface raw provider messages as the primary message.
 */
export function clientWorkerErrorMessage(t: TFn, e: unknown): string {
  if (e instanceof FetchApiError) {
    return messageFromApiPayload(t, { error: e.message, errorCode: e.errorCode });
  }
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code) {
      const key = `errors.supabase.${code}`;
      const m = t(key);
      if (m !== key) return m;
    }
  }
  return t("error.generic");
}
