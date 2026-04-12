import type { Lang } from "@/lib/i18n-config";
import type { Messages } from "./types";
import { ru } from "./ru";
import { uk } from "./uk";
import { en } from "./en";
import { nl } from "./nl";

export { ru, uk, en, nl };
export type { Messages } from "./types";

export const messages: Record<Lang, Messages> = {
  ru,
  uk,
  en,
  nl,
};

export function getMessage(messagesForLang: Messages, key: string): string | null {
  const parts = String(key || "").split(".").filter(Boolean);
  let current: unknown = messagesForLang;

  for (const part of parts) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : null;
}
