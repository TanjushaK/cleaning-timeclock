"use client";

import { useEffect, useMemo } from "react";
import { useI18n } from "./I18nProvider";

type Map = Record<string, string>;

const RU_TO_UK: Map = {
  "Админ-панель": "Адмін-панель",
  "Панель администратора": "Панель адміністратора",
  "Обновить данные": "Оновити дані",
  "Выйти": "Вийти",

  "Объекты": "Об’єкти",
  "Работники": "Працівники",
  "Смены": "Зміни",
  "График": "Графік",
  "Отчёты": "Звіти",

  "Создать смену": "Створити зміну",
  "Фильтры": "Фільтри",
  "Расписание": "Розклад",
  "Доска": "Дошка",

  "Новый объект": "Новий об’єкт",
  "Название": "Назва",
  "Адрес": "Адреса",
  "(необязательно)": "(необов’язково)",
  "Радиус (м)": "Радіус (м)",
  "Категория": "Категорія",
  "Без категории": "Без категорії",
  "Заметки": "Нотатки",
  "Закрыть": "Закрити",
  "Создать": "Створити",
  "Отмена": "Скасувати",
  "Например: Дом, офис, объект №1": "Наприклад: Дім, офіс, об’єкт №1",

  "Добавить объект": "Додати об’єкт",
  "Удалить": "Видалити",

  "Профиль": "Профіль",
  "Сохранить профиль": "Зберегти профіль",
  "Навигация": "Навігація",
  "Принять": "Прийняти",
  "Старт": "Почати",
  "Стоп": "Завершити",
  "Начать": "Почати",
  "Завершить": "Завершити",
  "Загрузить": "Завантажити",
  "Выберите файл": "Обрати файл",
  "Файл не выбран": "Файл не обрано",

  "Язык": "Мова",
};

const UK_TO_RU: Map = Object.fromEntries(
  Object.entries(RU_TO_UK).map(([ru, uk]) => [uk, ru])
);

function replaceExactWithSpaces(src: string, map: Map): string {
  const trimmed = src.trim();
  const hit = map[trimmed];
  if (!hit) return src;
  const lead = src.match(/^\s*/)?.[0] ?? "";
  const tail = src.match(/\s*$/)?.[0] ?? "";
  return lead + hit + tail;
}

function translateTextNodes(root: HTMLElement, map: Map) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const parent = (node as any).parentElement as HTMLElement | null;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
      const v = String(node.nodeValue ?? "");
      const nv = replaceExactWithSpaces(v, map);
      if (nv !== v) node.nodeValue = nv;
    }
    node = walker.nextNode();
  }
}

function translateAttributes(root: HTMLElement, map: Map) {
  const attrs = ["placeholder", "title", "aria-label", "alt", "value"];
  const all = root.querySelectorAll<HTMLElement>("*");
  for (const el of Array.from(all)) {
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const nv = replaceExactWithSpaces(v, map);
      if (nv !== v) el.setAttribute(a, nv);
    }
  }
}

function applyTranslation(lang: "uk" | "ru") {
  const root = document.body as HTMLElement;
  // baseline -> RU
  translateTextNodes(root, UK_TO_RU);
  translateAttributes(root, UK_TO_RU);
  // target -> UK
  if (lang === "uk") {
    translateTextNodes(root, RU_TO_UK);
    translateAttributes(root, RU_TO_UK);
  }
}

export default function AutoTranslate() {
  const { lang } = useI18n();

  const run = useMemo(() => {
    return () => applyTranslation(lang);
  }, [lang]);

  useEffect(() => {
    let t: any = null;
    const schedule = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        run();
      }, 50);
    };

    run(); // initial

    const obs = new MutationObserver(() => schedule());
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      if (t) clearTimeout(t);
      obs.disconnect();
    };
  }, [run]);

  return null;
}
