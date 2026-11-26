import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServices } from "../services.tsx";
import { Markdown } from "./Markdown.tsx";

// GitHubと同じ「Write / Preview」付きのコメント欄。下書きは端末に残す。

const DRAFT_PREFIX = "draft.";

function loadDraft(key: string | undefined) {
  if (!key) return "";
  try {
    return localStorage.getItem(DRAFT_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(key: string | undefined, text: string) {
  if (!key) return;
  try {
    if (text) localStorage.setItem(DRAFT_PREFIX + key, text);
    else localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    /* 保存できなくても続ける */
  }
}

export function Composer({
  draftKey,
  context,
  placeholder = "コメントを書く（Markdown）",
  submitLabel = "コメント",
  onSubmit,
  onCancel,
  extraActions,
  autoFocus = false,
  allowEmpty = false,
  initial,
  rows = 4,
}: {
  draftKey?: string;
  /** "owner/repo"。#123 などのリンクをプレビューで正しく出すため */
  context?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel?: () => void;
  /** 送信ボタンの左に並べる操作（「閉じる」など）。現在の本文を受け取る */
  extraActions?: (text: string, clear: () => void) => ReactNode;
  autoFocus?: boolean;
  allowEmpty?: boolean;
  initial?: string;
  rows?: number;
}) {
  const { client } = useServices();
  const [text, setText] = useState(() => initial ?? loadDraft(draftKey));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initial === undefined) saveDraft(draftKey, text);
  }, [draftKey, text, initial]);

  useEffect(() => {
    if (tab !== "preview") return;
    let alive = true;
    setPreview(null);
    client
      .renderMarkdown(text || "_何も書かれていません_", context)
      .then((html) => alive && setPreview(html))
      .catch((e: Error) => alive && setPreview(`<p>プレビューできませんでした: ${e.message.replace(/</g, "&lt;")}</p>`));
    return () => {
      alive = false;
    };
  }, [tab, text, client, context]);

  // 書いた分だけ高さを伸ばす
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.6)}px`;
  }, [text, tab]);

  const clear = () => {
    setText("");
    saveDraft(draftKey, "");
    setTab("write");
  };

  async function submit() {
    if (busy || (!allowEmpty && !text.trim())) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text);
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <div className="composer-tabs">
        <button className={tab === "write" ? "selected" : ""} onClick={() => setTab("write")} type="button">
          Write
        </button>
        <button className={tab === "preview" ? "selected" : ""} onClick={() => setTab("preview")} type="button">
          Preview
        </button>
      </div>
      {tab === "write" ? (
        <textarea
          ref={ref}
          value={text}
          rows={rows}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      ) : (
        <div className="composer-preview">{preview === null ? <p className="fg-muted">…</p> : <Markdown html={preview} />}</div>
      )}
      {error && <p className="fg-danger small composer-error">{error}</p>}
      <div className="composer-actions">
        {onCancel && (
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
        )}
        {extraActions?.(text, clear)}
        <button
          className="btn btn-primary"
          type="button"
          onClick={submit}
          disabled={busy || (!allowEmpty && !text.trim())}
        >
          {busy ? "送信中…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
