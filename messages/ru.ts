import type { Messages } from "./types";
import { adminRu } from "./admin-ru";
import { dotKeysToNested } from "./nest";
import { errorsApiRu } from "./errors-api";
import homeRu from "./home/ru.json";

const homeNested = dotKeysToNested(homeRu as Record<string, string>) as Record<string, unknown>;
const { errors: homeErrors, ...homeRest } = homeNested;

export const ru: Messages = {
  admin: adminRu,
  ...homeRest,
  errors: {
    ...(typeof homeErrors === "object" && homeErrors !== null && !Array.isArray(homeErrors)
      ? (homeErrors as Record<string, unknown>)
      : {}),
    api: errorsApiRu,
  },
};
