"use client";

import { useCallback, useEffect, useState } from "react";

import { authFetchJson } from "@/lib/auth-fetch";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import { useI18n } from "@/components/I18nProvider";
import type { Lang } from "@/lib/i18n-config";
import { formatDateTimeShort } from "@/lib/locale-format";

type ChatAttachment = {
  id: string;
  kind: string;
  mime_type: string;
  file_name: string | null;
  url: string;
};

type ChatMessage = {
  id: string;
  author_role: string;
  author_name: string;
  body: string | null;
  created_at: string;
  attachments: ChatAttachment[];
};

type MessagesResponse = {
  messages?: ChatMessage[];
  unread_count?: number;
};

export function WorkerShiftJobChatPanel(props: { jobId: string }) {
  const { jobId } = props;
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    const baseUrl = `/api/me/jobs/${encodeURIComponent(jobId)}`;
    setLoading(true);
    setErr(null);
    try {
      const res = await authFetchJson<MessagesResponse>(`${baseUrl}/messages`, { cache: "no-store" });
      setMessages(Array.isArray(res?.messages) ? res.messages : []);
      try {
        await authFetchJson(`${baseUrl}/messages/read`, { method: "POST", cache: "no-store" });
      } catch {
        // messages still shown if mark-read fails
      }
    } catch (e: unknown) {
      setErr(clientWorkerErrorMessage(t, e));
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, t]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function send() {
    const text = draft.trim();
    if (!jobId || busy || !text) return;
    const baseUrl = `/api/me/jobs/${encodeURIComponent(jobId)}`;
    setBusy(true);
    setErr(null);
    try {
      await authFetchJson<{ message?: ChatMessage }>(`${baseUrl}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
        cache: "no-store",
      });
      setDraft("");
      await load();
    } catch (e: unknown) {
      setErr(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  if (!jobId) return null;

  const uiBusy = loading || busy;

  return (
    <div className="mt-3 rounded-xl border border-amber-500/20 bg-zinc-950/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-semibold text-amber-100/90">{t("jobs.shiftChatTitle")}</span>
        <span className="text-xs text-amber-200/80">{open ? t("jobs.shiftChatHide") : t("jobs.shiftChatShow")}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-amber-500/15 px-3 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-50"
              onClick={() => void load()}
              disabled={uiBusy}
            >
              {t("jobs.shiftChatRefresh")}
            </button>
          </div>
          {err ? (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-100">{err}</div>
          ) : null}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-amber-500/15 bg-zinc-900/50 px-2 py-2">
            {loading && messages.length === 0 ? (
              <div className="text-[11px] text-zinc-500">{t("jobs.shiftChatLoading")}</div>
            ) : messages.length === 0 ? (
              <div className="text-[11px] text-zinc-500">{t("jobs.shiftChatEmpty")}</div>
            ) : (
              <ul className="grid gap-2">
                {messages.map((m) => (
                  <li key={m.id} className="rounded-lg border border-amber-500/10 bg-zinc-950/60 px-2 py-1.5 text-[11px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <span className="font-semibold text-amber-100/90">{m.author_name}</span>
                      <span className="text-zinc-500">{formatDateTimeShort(lang as Lang, m.created_at)}</span>
                    </div>
                    {m.body ? <p className="mt-1 whitespace-pre-wrap text-zinc-200">{m.body}</p> : null}
                    {m.attachments?.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((a) =>
                          a.kind === "image" && a.url ? (
                            <img
                              key={a.id}
                              src={a.url}
                              alt=""
                              className="max-h-24 max-w-[140px] rounded-md border border-amber-500/15 object-cover"
                            />
                          ) : a.kind === "video" && a.url ? (
                            <video key={a.id} src={a.url} controls className="max-h-36 max-w-[220px] rounded-md border border-amber-500/15" />
                          ) : a.url ? (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-amber-200 underline"
                            >
                              {a.file_name || a.mime_type}
                            </a>
                          ) : null,
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <textarea
            className="w-full min-h-[56px] rounded-lg border border-amber-500/20 bg-zinc-900/60 px-2 py-2 text-xs text-amber-50 outline-none focus:border-amber-400/40"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("jobs.shiftChatPlaceholder")}
            disabled={busy}
          />
          <button
            type="button"
            className="w-full rounded-lg bg-amber-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
            onClick={() => void send()}
            disabled={busy || !draft.trim()}
          >
            {busy ? t("jobs.shiftChatSending") : t("jobs.shiftChatSend")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
