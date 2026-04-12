import type { Messages } from "./types";
import { adminUk } from "./admin-uk";
import { dotKeysToNested } from "./nest";
import { errorsApiUk } from "./errors-api";
import homeUk from "./home/uk.json";

const homeNested = dotKeysToNested(homeUk as Record<string, string>) as Record<string, unknown>;
const { errors: homeErrors, ...homeRest } = homeNested;

export const uk: Messages = {
  admin: adminUk,
  ...homeRest,
  errors: {
    ...(typeof homeErrors === "object" && homeErrors !== null && !Array.isArray(homeErrors)
      ? (homeErrors as Record<string, unknown>)
      : {}),
    api: errorsApiUk,
  },
};
