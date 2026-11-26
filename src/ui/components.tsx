import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckCircleFillIcon,
  CircleSlashIcon,
  DotFillIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  IssueClosedIcon,
  IssueOpenedIcon,
  SkipIcon,
  StopIcon,
  SyncIcon,
  XCircleFillIcon,
  AlertIcon,
  SquareFillIcon,
} from "@primer/octicons-react";
import type { Label, PrState } from "../lib/gql.ts";
import type { Tone } from "../lib/status.ts";
import { TONE_LABEL } from "../lib/status.ts";
import { goBack, useRoute } from "../router.tsx";
import { relativeTime } from "./time.ts";

export function Avatar({ src, login, size = 20 }: { src?: string | null; login?: string | null; size?: number }) {
  if (!src) return <span className="avatar avatar-empty" style={{ width: size, height: size }} />;
  const url = src + (src.includes("?") ? "&" : "?") + `s=${size * 2}`;
  return (
    <img
      className="avatar"
      src={url}
      alt={login ? `@${login}` : ""}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

export function RelTime({ iso, prefix = "", suffix = "" }: { iso: string | null | undefined; prefix?: string; suffix?: string }) {
  if (!iso) return null;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("ja-JP")}>
      {prefix}
      {relativeTime(iso)}
      {suffix}
    </time>
  );
}

type PrVisual = "open" | "draft" | "merged" | "closed";

export function prVisual(state: PrState, isDraft: boolean): PrVisual {
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  return isDraft ? "draft" : "open";
}

const PR_ICON = {
  open: GitPullRequestIcon,
  draft: GitPullRequestDraftIcon,
  merged: GitMergeIcon,
  closed: GitPullRequestClosedIcon,
};
const PR_TEXT = { open: "Open", draft: "Draft", merged: "Merged", closed: "Closed" };

export function PrStateIcon({ state, isDraft, size = 16 }: { state: PrState; isDraft: boolean; size?: number }) {
  const v = prVisual(state, isDraft);
  const Icon = PR_ICON[v];
  return <Icon size={size} className={`state-fg-${v}`} aria-label={PR_TEXT[v]} />;
}

export function StateLabel({ state, isDraft }: { state: PrState; isDraft: boolean }) {
  const v = prVisual(state, isDraft);
  const Icon = PR_ICON[v];
  return (
    <span className={`state-label state-bg-${v}`}>
      <Icon size={16} />
      {PR_TEXT[v]}
    </span>
  );
}

export function IssueStateLabel({ state, reason }: { state: "OPEN" | "CLOSED"; reason?: string | null }) {
  if (state === "OPEN") {
    return (
      <span className="state-label state-bg-open">
        <IssueOpenedIcon size={16} />
        Open
      </span>
    );
  }
  const notPlanned = reason === "NOT_PLANNED";
  return (
    <span className={`state-label ${notPlanned ? "state-bg-draft" : "state-bg-merged"}`}>
      {notPlanned ? <CircleSlashIcon size={16} /> : <IssueClosedIcon size={16} />}
      Closed
    </span>
  );
}

export function ToneIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  const label = TONE_LABEL[tone];
  switch (tone) {
    case "success":
      return <CheckCircleFillIcon size={size} className="fg-success" aria-label={label} />;
    case "failure":
      return <XCircleFillIcon size={size} className="fg-danger" aria-label={label} />;
    case "running":
      return <SyncIcon size={size} className="fg-attention spin" aria-label={label} />;
    case "pending":
      return <DotFillIcon size={size} className="fg-attention" aria-label={label} />;
    case "skipped":
      return <SkipIcon size={size} className="fg-muted" aria-label={label} />;
    case "cancelled":
      return <StopIcon size={size} className="fg-muted" aria-label={label} />;
    case "action":
      return <AlertIcon size={size} className="fg-attention" aria-label={label} />;
    default:
      return <SquareFillIcon size={size} className="fg-muted" aria-label={label} />;
  }
}

/** ラベルの色（16進）から読みやすい文字色を決める */
export function LabelChip({ label }: { label: Label }) {
  const hex = /^[0-9a-f]{6}$/i.test(label.color) ? label.color : "8b949e";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const light = (r * 299 + g * 587 + b * 114) / 1000 > 150;
  return (
    <span
      className="label-chip"
      style={{ backgroundColor: `#${hex}`, color: light ? "#1f2328" : "#ffffff", borderColor: `#${hex}` }}
    >
      {label.name}
    </span>
  );
}

export function Branch({ name }: { name: string }) {
  return <code className="branch">{name}</code>;
}

export function Counter({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  return <span className="counter">{n.toLocaleString()}</span>;
}

export function Loading({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <SyncIcon size={16} className="spin" /> {label}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="box" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="box-row" key={i}>
          <div className="skeleton" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
          <div className="skeleton short" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="flash flash-error">
      <AlertIcon size={16} />
      <div className="flash-body">
        <div>{error.message}</div>
        {retry && (
          <button className="btn btn-sm" onClick={retry}>
            再試行
          </button>
        )}
      </div>
    </div>
  );
}

/** 画面上部のバー（戻る・題名・右側の操作） */
export function AppHeader({
  title,
  context,
  right,
  back = true,
}: {
  title: ReactNode;
  context?: ReactNode;
  right?: ReactNode;
  back?: boolean;
}) {
  const route = useRoute();
  return (
    <header className="app-header">
      {back && (
        <button className="header-btn" onClick={() => goBack(route)} aria-label="戻る">
          <ArrowLeftIcon size={20} />
        </button>
      )}
      <div className="header-title">
        {context && <div className="header-context">{context}</div>}
        <div className="header-main">{title}</div>
      </div>
      {right && <div className="header-right">{right}</div>}
    </header>
  );
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon?: ReactNode;
  count?: number;
  onIntent?: () => void;
}

export function UnderlineNav({ items, active, sticky = false }: { items: NavItem[]; active: string; sticky?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  // 選ばれているタブが見えるように横スクロールする
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav className={`underline-nav ${sticky ? "sticky" : ""}`} ref={ref}>
      {items.map((it) => (
        <a
          key={it.key}
          href={it.href}
          className="underline-item"
          aria-current={it.key === active ? "page" : undefined}
          onPointerDown={it.onIntent}
          onMouseEnter={it.onIntent}
        >
          {it.icon}
          <span>{it.label}</span>
          <Counter n={it.count} />
        </a>
      ))}
    </nav>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="btn-octicon" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** 画面に近づいたときに初めて中身を描く（大きな差分やログで最初の表示を速くする） */
export function LazyRender({
  estimate,
  children,
  force = false,
}: {
  estimate: number;
  children: () => ReactNode;
  force?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setShown] = useState(false);
  const shown = seen || force;
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  if (shown) return <>{children()}</>;
  return <div ref={ref} style={{ height: estimate }} />;
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  return online;
}
