"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { authFetch, authFetchJson } from "@/lib/auth-fetch";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import { FetchApiError } from "@/lib/fetch-api-error";
import { useI18n } from "@/components/I18nProvider";

const MAX_PHOTOS = 5;
/** Client-side guard aligned with worker-admin-chat-media MAX_UPLOAD_BYTES (default 50 MB). */
const CLIENT_MAX_PHOTO_BYTES = 50 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif)$/i;

type ChatAttachment = {
  id: string;
  url: string | null;
  display_url?: string | null;
  mime_type?: string | null;
};

type ChatMessage = {
  id: string;
  author_role: string;
  author_name: string | null;
  body: string;
  created_at: string;
  attachments: ChatAttachment[];
};

type MessagesResponse = {
  messages?: ChatMessage[];
  unread_count?: number;
};

function sortByCreatedAtAsc(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function isLikelyImageFile(f: File): boolean {
  const mime = String(f.type || "").toLowerCase().trim();
  if (mime.startsWith("image/")) return true;
  if (IMAGE_EXT_RE.test(f.name || "")) return true;
  if (f.size > 0 && (mime === "" || mime === "application/octet-stream")) {
    return true;
  }
  return false;
}

function uploadFileName(f: File): string {
  const name = String(f.name || "").trim();
  if (IMAGE_EXT_RE.test(name)) return name;
  const mime = String(f.type || "").toLowerCase();
  if (mime === "image/png") return "photo.png";
  if (mime === "image/webp") return "photo.webp";
  if (mime === "image/heic" || mime === "image/heic-sequence") return "photo.heic";
  if (mime === "image/heif" || mime === "image/heif-sequence") return "photo.heif";
  return "photo.jpg";
}

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function parseMultipartErrorResponse(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = (await res.json().catch(() => null)) as {
        error?: string;
        errorCode?: string;
        message?: string;
      } | null;
      if (j && typeof j === "object") {
        const parts = [j.errorCode, j.error || j.message].filter(Boolean);
        if (parts.length) return parts.join(" — ");
      }
    } else {
      const text = await res.text().catch(() => "");
      const s = text.trim();
      if (s) return s.length > 400 ? `${s.slice(0, 400)}…` : s;
    }
  } catch {
    // ignore
  }
  return `HTTP ${res.status}`;
}

function AttachmentImage({
  attachment,
  photoUnavailable,
}: {
  attachment: ChatAttachment;
  photoUnavailable: string;
}) {
  const rawUrl = attachment.url || attachment.display_url || "";
  const [broken, setBroken] = useState(!rawUrl);

  if (broken || !rawUrl) {
    return <div className="text-xs opacity-60 py-1">{photoUnavailable}</div>;
  }

  return (
    <img
      src={rawUrl}
      alt=""
      className="max-h-48 w-auto max-w-full rounded-lg border border-amber-500/20 object-contain"
      onError={() => setBroken(true)}
    />
  );
}

export default function WorkerAdminChatWeb() {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const photoPreviews = useMemo(() => selectedFiles.map((f) => URL.createObjectURL(f)), [selectedFiles]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      for (const u of photoPreviews) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      }
    };
  }, [photoPreviews]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const loadMessages = useCallback(async () => {
    setError(null);
    const res = await authFetch(`/api/me/admin-chat/messages?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    const data = (await res.json().catch(() => ({}))) as MessagesResponse & { error?: string; errorCode?: string };
    if (!res.ok) {
      const code = data.errorCode ? String(data.errorCode) : "";
      throw new FetchApiError(code ? `admin.api.${code}` : String(data.error || `HTTP ${res.status}`), {
        status: res.status,
        errorCode: code || undefined,
      });
    }
    const raw = Array.isArray(data.messages) ? data.messages : [];
    setMessages(sortByCreatedAtAsc(raw as ChatMessage[]));

    await authFetch("/api/me/admin-chat/messages/read", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadMessages();
      } catch (e: unknown) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMessages, t]);

  useLayoutEffect(() => {
    if (loading) return;
    requestAnimationFrame(() => scrollToBottom());
  }, [loading, messages, scrollToBottom]);

  const onRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadMessages();
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setLoading(false);
    }
  }, [loadMessages, t]);

  const removePreviewAt = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onPickFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) {
        return;
      }

      let added = 0;
      let sawTooLarge = false;
      let rejectDiag: string | null = null;

      setSelectedFiles((prev) => {
        const next = [...prev];
        for (let i = 0; i < list.length; i++) {
          const f = list.item(i);
          if (!f) continue;
          if (next.length >= MAX_PHOTOS) break;
          if (f.size > CLIENT_MAX_PHOTO_BYTES) {
            sawTooLarge = true;
            continue;
          }
          if (!isLikelyImageFile(f)) {
            if (!rejectDiag) {
              const typeLabel = f.type?.trim() ? f.type : "empty";
              rejectDiag = `Rejected file: ${f.name || "unnamed"} · ${typeLabel} · ${formatFileSize(f.size)}`;
            }
            continue;
          }
          next.push(f);
          added++;
        }
        return next;
      });

      if (added === 0 && list.length > 0) {
        if (rejectDiag) {
          setError(rejectDiag);
        } else if (sawTooLarge) {
          setError(t("workerAdminChat.photoTooLarge"));
        } else {
          setError(t("workerAdminChat.noValidFilesAfterPick"));
        }
      } else if (sawTooLarge) {
        setError(t("workerAdminChat.photoTooLarge"));
      } else {
        setError(null);
      }

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [t],
  );

  const send = useCallback(async () => {
    const trimmed = body.trim();
    const files = selectedFiles;
    if (!trimmed && files.length === 0) return;

    setSending(true);
    setError(null);
    let warnAttachmentsMissing = false;
    try {
      if (files.length === 0) {
        await authFetchJson("/api/me/admin-chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        });
      } else {
        const fd = new FormData();
        if (trimmed) fd.append("body", trimmed);
        for (const f of files) {
          fd.append("photos", f, uploadFileName(f));
        }

        const res = await authFetch("/api/me/admin-chat/messages", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const detail = await parseMultipartErrorResponse(res);
          const line = t("workerAdminChat.uploadFailedLine", {
            status: String(res.status),
            detail,
          });
          throw new FetchApiError(line, { status: res.status });
        }

        const payload = (await res.json().catch(() => ({}))) as {
          message?: { attachments?: ChatAttachment[] };
        };
        warnAttachmentsMissing =
          files.length > 0 && (!payload?.message?.attachments || payload.message.attachments.length === 0);

        if (fileInputRef.current) fileInputRef.current.value = "";
      }

      setBody("");
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";

      await loadMessages();

      if (warnAttachmentsMissing) {
        setError(t("workerAdminChat.attachmentsMissingInResponse"));
      }
      requestAnimationFrame(() => scrollToBottom());
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setSending(false);
    }
  }, [body, loadMessages, scrollToBottom, selectedFiles, t]);

  const locale = lang === "ru" ? "ru-RU" : lang === "uk" ? "uk-UA" : lang === "nl" ? "nl-NL" : "en-GB";

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl flex flex-col min-h-0 min-w-0 max-h-[min(520px,70vh)] lg:max-h-[520px]">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="text-lg font-semibold">{t("workerAdminChat.title")}</div>
        <button
          type="button"
          className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60 shrink-0"
          disabled={loading || sending}
          onClick={() => void onRefresh()}
        >
          {t("common.refresh")}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}

      <div
        ref={listRef}
        className="mt-3 flex-1 min-h-[200px] max-h-[420px] overflow-y-auto rounded-xl border border-amber-500/15 bg-zinc-900/40 p-3 space-y-3"
      >
        {loading && messages.length === 0 ? (
          <div className="text-sm opacity-70">{t("common.loading")}</div>
        ) : null}
        {!loading && messages.length === 0 ? (
          <div className="text-sm opacity-70">{t("workerAdminChat.empty")}</div>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border px-3 py-2 text-sm ${
              m.author_role === "admin"
                ? "border-amber-500/25 bg-amber-500/5"
                : "border-zinc-600/40 bg-zinc-900/50"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs opacity-80">
              <span className="font-medium opacity-90">{m.author_name || "—"}</span>
              <span>
                {new Date(m.created_at).toLocaleString(locale, {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {m.body ? <div className="mt-1 whitespace-pre-wrap break-words">{m.body}</div> : null}
            {m.attachments?.length ? (
              <div className="mt-2 space-y-2">
                {m.attachments.map((a) => (
                  <AttachmentImage key={a.id} attachment={a} photoUnavailable={t("workerAdminChat.photoUnavailable")} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 shrink-0 space-y-2">
        <textarea
          className="w-full min-h-[88px] rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50 resize-y"
          placeholder={t("workerAdminChat.messagePlaceholder")}
          value={body}
          disabled={sending}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="relative flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-50 disabled:pointer-events-none"
            disabled={sending || selectedFiles.length >= MAX_PHOTOS}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("workerAdminChat.attachPhotos")}
          </button>
          <input
            ref={fileInputRef}
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            multiple
            className="sr-only"
            disabled={sending || selectedFiles.length >= MAX_PHOTOS}
            onClick={(e) => {
              e.currentTarget.value = "";
            }}
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <span className="text-xs opacity-70">
            {selectedFiles.length}/{MAX_PHOTOS} · {t("workerAdminChat.maxPhotosHint")}
          </span>
        </div>

        {selectedFiles.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((f, i) => (
                <div
                  key={`${f.name}-${i}-${f.lastModified}`}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-amber-500/20"
                >
                  <img src={photoPreviews[i] || ""} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white hover:bg-black/65"
                    onClick={() => removePreviewAt(i)}
                    aria-label={t("workerAdminChat.removeSelected")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <ul className="text-[11px] text-zinc-400 space-y-0.5">
              {selectedFiles.map((f, i) => (
                <li key={`meta-${f.name}-${i}-${f.lastModified}`} className="truncate">
                  {f.name || "photo"} · {formatFileSize(f.size)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
          disabled={sending || (!body.trim() && selectedFiles.length === 0)}
          onClick={() => void send()}
        >
          {sending ? t("workerAdminChat.sending") : t("workerAdminChat.send")}
        </button>
      </div>
    </div>
  );
}
