"use client";
import { useEffect } from "react";
import { useI18n } from "./I18nProvider";

const RU_TO_UK: Record<string, string> = {
  "Смены": "Зміни",
  "Профиль": "Профіль",
  "Принять": "Прийняти",
  "Старт": "Почати",
  "Стоп": "Завершити",
  "Начать": "Почати",
  "Завершить": "Завершити",
  "Работники": "Працівники",
  "Создать смену": "Створити зміну",
  "Фильтры": "Фільтри",
  "Панель администратора": "Панель адміністратора",
  "Выйти": "Вийти",
  "Навигация": "Навігація",
  "Язык": "Мова",
};

const UK_TO_RU: Record<string, string> = Object.fromEntries(Object.entries(RU_TO_UK).map(([ru, uk]) => [uk, ru]));

function walkAndReplace(root: HTMLElement, map: Record<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = (node as any).parentElement as HTMLElement | null;
    if (parent && !["SCRIPT","STYLE","NOSCRIPT"].includes(parent.tagName)) {
      const txt = String(node.nodeValue ?? "");
      const trimmed = txt.trim();
      if (trimmed && map[trimmed]) {
        const lead = txt.match(/^\\s*/)?.[0] ?? "";
        const tail = txt.match(/\\s*$/)?.[0] ?? "";
        node.nodeValue = lead + map[trimmed] + tail;
      }
    }
    node = walker.nextNode();
  }
}

export default function AutoTranslate() {
  const { lang } = useI18n();
  useEffect(() => {
    const root = document.body as HTMLElement;
    walkAndReplace(root, UK_TO_RU);
    if (lang === "uk") walkAndReplace(root, RU_TO_UK);
  }, [lang]);
  return null;
}
