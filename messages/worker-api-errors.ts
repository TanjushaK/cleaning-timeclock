import { AppApiErrorCodes } from "@/lib/app-error-codes";

function fillApiErrors(message: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const v of Object.values(AppApiErrorCodes)) {
    o[v] = message;
  }
  return o;
}

export const workerApiErrorsEn = fillApiErrors("Could not complete the request. Please try again.");

export const workerApiErrorsRu = fillApiErrors("Не удалось выполнить запрос. Попробуйте ещё раз.");

export const workerApiErrorsUk = fillApiErrors("Не вдалося виконати запит. Спробуйте ще раз.");

export const workerApiErrorsNl = fillApiErrors("Verzoek mislukt. Probeer het opnieuw.");
