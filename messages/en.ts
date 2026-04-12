import type { Messages } from "./types";
import { adminEn } from "./admin-en";
import { dotKeysToNested } from "./nest";
import { errorsApiEn } from "./errors-api";
import homeEn from "./home/en.json";

const homeNested = dotKeysToNested(homeEn as Record<string, string>) as Record<string, unknown>;
const { errors: homeErrors, ...homeRest } = homeNested;

export const en: Messages = {
  admin: adminEn,
  ...homeRest,
  errors: {
    ...(typeof homeErrors === "object" && homeErrors !== null && !Array.isArray(homeErrors)
      ? (homeErrors as Record<string, unknown>)
      : {}),
    api: errorsApiEn,
  },
};
