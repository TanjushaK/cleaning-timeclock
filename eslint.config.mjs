import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Цель этого конфига: 1) НЕ трогать runtime/функционал, 2) не блокировать деплой на
// legacy-коде, 3) оставить включёнными реально полезные проверки.
// Поэтому мы отключаем только те правила, которые в этом проекте создают шум
// (any/unused/a11y/img/link) и не влияют на корректность выполнения.

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

  // Не блокируем деплой “шумными” правилами. Функционал не трогаем.
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Legacy-типизация: в проекте много any, это не runtime-ошибка.
      "@typescript-eslint/no-explicit-any": "off",

      // В Next App Router часто есть намеренно “лишние” хелперы/импорты в админке.
      "@typescript-eslint/no-unused-vars": "off",

      // UX/а11y — важно, но не должно стопорить релиз. Вернём позже в отдельном этапе.
      "jsx-a11y/alt-text": "off",

      // В проекте есть <img> и <a> для статичных страниц/iframe-обвязки.
      // Это performance/стайл-гайд, а не runtime-ошибка.
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
