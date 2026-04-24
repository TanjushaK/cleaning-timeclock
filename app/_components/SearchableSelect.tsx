"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { Lang } from "@/lib/i18n-config";

export type SearchableSelectItem = {
  id: string;
  label: string;
  hint?: string;
  dotClass?: string;
};

type Props = {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  items: SearchableSelectItem[];
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
};

const SORT_LOCALE: Record<Lang, string> = {
  ru: "ru",
  uk: "uk",
  en: "en",
  nl: "nl",
};

function dotToTextClass(dotClass?: string) {
  switch (dotClass) {
    case "bg-emerald-400":
      return "text-emerald-200";
    case "bg-sky-400":
      return "text-sky-200";
    case "bg-violet-400":
      return "text-violet-200";
    case "bg-fuchsia-400":
      return "text-fuchsia-200";
    case "bg-rose-400":
      return "text-rose-200";
    case "bg-amber-400":
      return "text-amber-200";
    case "bg-lime-400":
      return "text-lime-200";
    case "bg-cyan-400":
      return "text-cyan-200";
    case "bg-indigo-400":
      return "text-indigo-200";
    case "bg-orange-400":
      return "text-orange-200";
    case "bg-teal-400":
      return "text-teal-200";
    case "bg-pink-400":
      return "text-pink-200";
    case "bg-red-400":
      return "text-red-200";
    case "bg-purple-400":
      return "text-purple-200";
    case "bg-green-400":
      return "text-green-200";
    case "bg-zinc-500":
      return "text-zinc-200";
    default:
      return "text-zinc-200";
  }
}

export function SearchableSelect({ label, value, onChange, items, placeholder, disabled, inputClassName }: Props) {
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const sortLocale = SORT_LOCALE[lang] ?? "en";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => items.find((x) => x.id === value) || null, [items, value]);
  const [query, setQuery] = useState<string>(selected?.label || "");

  useEffect(() => {
    setQuery(selected?.label || "");
  }, [selected?.id, selected?.label]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const base = items.slice().sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), sortLocale));
    if (!q) return base;
    return base.filter((it) => {
      const a = String(it.label || "").toLowerCase();
      const h = String(it.hint || "").toLowerCase();
      return a.includes(q) || h.includes(q);
    });
  }, [items, query, sortLocale]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains?.(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true } as AddEventListenerOptions);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="ctSearchableSelect relative">
      {label ? <div className="mb-1 text-[11px] text-zinc-300">{label}</div> : null}

      <input
        ref={inputRef}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!disabled) setOpen(true);

          if (!e.target.value) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className={
          inputClassName
            ? `ctSearchableSelectInput ${inputClassName}`
            : "ctSearchableSelectInput w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
        }
      />

      {open ? (
        <div
          className={
            "ctSearchableSelectMenu absolute left-0 right-0 z-[80] mt-2 max-h-80 overflow-auto rounded-2xl border backdrop-blur-sm " +
            (isLight
              ? "border-amber-500/30 bg-white/95 shadow-xl"
              : "border-yellow-400/25 bg-[#0b0b0b]/95 shadow-2xl")
          }
        >
          {filtered.length ? (
            filtered.map((it) => {
              const active = it.id === value;
              const textClass = isLight ? "text-zinc-700" : dotToTextClass(it.dotClass);
              return (
                <button
                  key={it.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(it.id);
                    setQuery(it.label);
                    setOpen(false);
                  }}
                  className={
                    "ctSearchableSelectOption flex w-full items-start gap-3 px-3 py-2 text-left text-xs transition " +
                    (active
                      ? (isLight ? "bg-amber-500/15 text-amber-800" : "bg-yellow-400/15 text-yellow-100")
                      : (isLight
                          ? "text-zinc-700 hover:bg-amber-500/10 hover:text-amber-800"
                          : "text-zinc-200 hover:bg-yellow-400/10 hover:text-yellow-100"))
                  }
                >
                  <span
                    className={
                      "mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full ring-2 shadow " +
                      (isLight ? "ring-amber-950/10 " : "ring-black/40 ") +
                      (it.dotClass || "bg-zinc-500")
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className={"block truncate font-semibold " + (active ? "" : textClass)}>{it.label}</span>
                    {it.hint ? (
                      <span
                        className={
                          "ctSearchableSelectHint mt-0.5 block truncate text-[10px] " +
                          (isLight ? "text-zinc-500" : "text-zinc-400")
                        }
                      >
                        {it.hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          ) : (
            <div className={"ctSearchableSelectEmpty px-3 py-3 text-xs " + (isLight ? "text-zinc-500" : "text-zinc-400")}>
              {t("searchableSelect.empty")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
