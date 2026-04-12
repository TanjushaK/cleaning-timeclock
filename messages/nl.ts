import type { Messages } from "./types";
import { adminNl } from "./admin-nl";
import { dotKeysToNested } from "./nest";
import { errorsApiNl } from "./errors-api";
import homeNl from "./home/nl.json";

const homeNested = dotKeysToNested(homeNl as Record<string, string>) as Record<string, unknown>;
const { errors: homeErrors, ...homeRest } = homeNested;

export const nl: Messages = {
  admin: adminNl,
  ...homeRest,
  errors: {
    ...(typeof homeErrors === "object" && homeErrors !== null && !Array.isArray(homeErrors)
      ? (homeErrors as Record<string, unknown>)
      : {}),
    api: errorsApiNl,
  },
};
