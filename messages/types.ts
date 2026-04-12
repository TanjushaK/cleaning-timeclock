import type { Lang } from "@/lib/i18n-config";

/** Admin namespaces use dot-paths: admin.common.panelTitle → getMessage(..., "admin.common.panelTitle") */
export type AdminNamespaces = {
  common: Record<string, string>;
  main: Record<string, string>;
  approvals: Record<string, string>;
  hours: Record<string, string>;
  fact: Record<string, string>;
  reports: Record<string, string>;
  sites: Record<string, string>;
  workers: Record<string, string>;
  plan: Record<string, string>;
};

export type Messages = {
  admin: AdminNamespaces;
  /** API error codes → short English (fallback); client uses errors.api.<code> */
  errors: {
    api: Record<string, string>;
  };
} & Record<string, unknown>;

export type MessagesRecord = Record<Lang, Messages>;
