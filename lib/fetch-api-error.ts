/** Thrown by authFetchJson when the response is not OK; carries optional API errorCode. */
export class FetchApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  /** Original API `error` string (worker UI can show it when i18n is generic). */
  readonly serverError?: string;

  constructor(message: string, opts?: { status?: number; errorCode?: string; serverError?: string }) {
    super(message);
    this.name = "FetchApiError";
    this.status = opts?.status ?? 0;
    this.errorCode = opts?.errorCode;
    this.serverError = opts?.serverError;
  }
}
