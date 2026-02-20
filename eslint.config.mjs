import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Backup / scratch files that are not production code:
    ".tmp/**",
    "**/_old_admin_*.tsx",
    "**/*.bak.tsx",
    "**/*-backup.tsx",
    // Binary assets:
    "**/*.zip",
  ]),
  // Downgrade no-explicit-any to a warning.
  // API routes and the admin panel use `any` intentionally for dynamic
  // Supabase query results; changing them all would require full schema
  // type generation and is out of scope here.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
