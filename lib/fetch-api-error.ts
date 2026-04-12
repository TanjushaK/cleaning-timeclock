/** Thrown by authFetchJson when the response is not OK; carries optional API errorCode. */
export class FetchApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, opts?: { status?: number; errorCode?: string }) {
    super(message);
    this.name = "FetchApiError";
    this.status = opts?.status ?? 0;
    this.errorCode = opts?.errorCode;
  }
}
