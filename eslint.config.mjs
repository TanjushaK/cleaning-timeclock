import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Явно задаём игноры (у вас override дефолтных игноров Next)
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Локальные черновики/бэкапы — НЕ линтим
    ".tmp/**",
    "app/admin/_old_admin_page_*.tsx",
    "**/*.bak.*",
    "**/*.objects-backup.*",
    "**/*.SITES_OK.bak.*",
  ]),

  // Чтобы линт не блокировал деплой из-за legacy any (их сейчас много по проекту)
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
]);

export default eslintConfig;