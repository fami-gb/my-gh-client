import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CodeReviewIcon,
  CommentIcon,
  FileDiffIcon,
  FoldIcon,
  LinkExternalIcon,
  TrashIcon,
  UnfoldIcon,
  WrapIcon,
} from "@primer/octicons-react";
import { anchorKey, diffstatBlocks, indexThreads, lineAnchor, parsePatch, type DiffLine, type DiffSide } from "../lib/diff.ts";
import type { PullDetail, ReviewThread } from "../lib/gql.ts";
import type { PullFile, ReviewEvent } from "../lib/github.ts";
import { useServices } from "../services.tsx";
import { ErrorBox, LazyRender, Sheet, Skeleton } from "./components.tsx";
import { Composer } from "./Composer.tsx";
import { openExternal } from "./open.ts";
import { usePullFiles } from "./queries.ts";
import { ReviewThreadView } from "./ReviewThread.tsx";
import { refreshPull } from "./useAction.ts";

// 「変更ファイル」タブ。行番号を押すと行コメントを書ける（すぐ送る or レビューにまとめる）。

interface PendingComment {
  id: string;
  path: string;
  side: DiffSide;
  line: number;
  body: string;
}

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できなくても続ける */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export default function FilesTab({ pr, owner, repo }: { pr: PullDetail; owner: string; repo: string }) {
  const files = usePullFiles(owner, repo, pr.number, pr.headRefOid);
  const storeKey = `${owner}/${repo}#${pr.number}`;
  const [pending, setPending] = usePersistentState<PendingComment[]>(`review.pending.${storeKey}`, []);
  const [viewed, setViewed] = usePersistentState<Record<string, string>>(`review.viewed.${storeKey}`, {});
  const [wrap, setWrap] = usePersistentState<boolean>("diff.wrap", true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [finishing, setFinishing] = useState(false);

  const threadsByPath = useMemo(() => {
    const map = new Map<string, ReviewThread[]>();
    for (const t of pr.reviewThreads.nodes) {
      const list = map.get(t.path);
      if (list) list.push(t);
      else map.set(t.path, [t]);
    }
    return map;
  }, [pr.reviewThreads.nodes]);

  const toggle = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (files.isPending) return <Skeleton rows={6} />;
  if (files.isError) return <ErrorBox error={files.error} retry={() => files.refetch()} />;

  const list = files.data.filter((f) => !filter || f.filename.toLowerCase().includes(filter.toLowerCase()));
  const adds = files.data.reduce((s, f) => s + f.additions, 0);
  const dels = files.data.reduce((s, f) => s + f.deletions, 0);
  const viewedCount = files.data.filter((f) => viewed[f.filename] === f.sha).length;

  return (
    <div className={`files-tab ${wrap ? "wrap" : ""}`}>
      <div className="files-toolbar">
        <span className="small">
          <strong>{files.data.length}</strong> ファイル <span className="fg-success">+{adds.toLocaleString()}</span>{" "}
          <span className="fg-danger">−{dels.toLocaleString()}</span> · 確認済み {viewedCount}/{files.data.length}
        </span>
        <span className="push-right row-gap">
          {pr.state === "OPEN" && (
            <button className="btn btn-sm btn-primary" onClick={() => setFinishing(true)}>
              <CodeReviewIcon size={14} />
              レビュー{pending.length ? ` (${pending.length})` : ""}
            </button>
          )}
          <button className={`btn btn-sm ${wrap ? "selected" : ""}`} onClick={() => setWrap(!wrap)} aria-pressed={wrap} title="折り返し">
            <WrapIcon size={14} />
          </button>
          <button
            className="btn btn-sm"
            title={collapsed.size ? "すべて開く" : "すべてたたむ"}
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(files.data.map((f) => f.filename)))}
          >
            {collapsed.size ? <UnfoldIcon size={14} /> : <FoldIcon size={14} />}
          </button>
        </span>
      </div>
      {files.data.length > 8 && (
        <input
          className="files-filter"
          type="search"
          placeholder="ファイル名で絞り込む"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      {list.map((f) => (
        <FileDiff
          key={f.filename}
          file={f}
          pr={pr}
          owner={owner}
          repo={repo}
          threads={threadsByPath.get(f.filename)}
          pending={pending}
          setPending={setPending}
          collapsed={collapsed.has(f.filename) || viewed[f.filename] === f.sha}
          viewed={viewed[f.filename] === f.sha}
          onToggle={toggle}
          onViewed={(v) => {
            setViewed((prev) => {
              const next = { ...prev };
              if (v) next[f.filename] = f.sha;
              else delete next[f.filename];
              return next;
            });
            if (!v) setCollapsed((prev) => new Set([...prev].filter((x) => x !== f.filename)));
          }}
        />
      ))}
      {pr.state === "OPEN" && list.length > 0 && (
        <button className="btn btn-primary btn-block" onClick={() => setFinishing(true)}>
          <CodeReviewIcon size={16} />
          レビューを完了{pending.length ? `（保留中 ${pending.length}件）` : ""}
        </button>
      )}
      {finishing && (
        <FinishReview pr={pr} owner={owner} repo={repo} pending={pending} onDone={() => setPending([])} onClose={() => setFinishing(false)} />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  added: "追加",
  removed: "削除",
  renamed: "名前変更",
  copied: "コピー",
};

const FileDiff = memo(function FileDiff({
  file,
  pr,
  owner,
  repo,
  threads,
  pending,
  setPending,
  collapsed,
  viewed,
  onToggle,
  onViewed,
}: {
  file: PullFile;
  pr: PullDetail;
  owner: string;
  repo: string;
  threads?: ReviewThread[];
  pending: PendingComment[];
  setPending: (fn: (p: PendingComment[]) => PendingComment[]) => void;
  collapsed: boolean;
  viewed: boolean;
  onToggle: (name: string) => void;
  onViewed: (v: boolean) => void;
}) {
  const lines = useMemo(() => parsePatch(file.patch), [file.patch]);
  const lineThreads = useMemo(() => indexThreads(threads ?? []), [threads]);
  const outdated = (threads ?? []).filter((t) => t.line == null);
  const myPending = pending.filter((p) => p.path === file.filename);
  const commentCount = (threads?.length ?? 0) + myPending.length;

  return (
    <section className="file">
      <header className="file-header">
        <button className="btn-octicon" onClick={() => onToggle(file.filename)} aria-label={collapsed ? "開く" : "たたむ"}>
          {collapsed ? <ChevronRightIcon size={16} /> : <ChevronDownIcon size={16} />}
        </button>
        <span className="file-stats">
          <span className="fg-success">+{file.additions}</span> <span className="fg-danger">−{file.deletions}</span>{" "}
          <span className="diffstat">
            {diffstatBlocks(file.additions, file.deletions).map((b, i) => (
              <span key={i} className={`diffstat-block ${b}`} />
            ))}
          </span>
        </span>
        <span className="file-name mono" title={file.filename}>
          {file.previous_filename ? `${file.previous_filename} → ` : ""}
          {file.filename}
        </span>
        {STATUS_LABEL[file.status] && <span className="badge-outline">{STATUS_LABEL[file.status]}</span>}
        {commentCount > 0 && (
          <span className="fg-muted small nowrap">
            <CommentIcon size={12} /> {commentCount}
          </span>
        )}
        <label className="viewed-toggle">
          <input type="checkbox" checked={viewed} onChange={(e) => onViewed(e.target.checked)} />
          確認済み
        </label>
      </header>
      {!collapsed && (
        <div className="file-body">
          {outdated.length > 0 && (
            <details className="outdated">
              <summary>古い行へのコメント {outdated.length}件</summary>
              {outdated.map((t) => (
                <ReviewThreadView key={t.id} thread={t} owner={owner} repo={repo} number={pr.number} showContext />
              ))}
            </details>
          )}
          {lines.length === 0 ? (
            <div className="file-empty fg-muted small">
              {file.status === "renamed" && file.changes === 0
                ? "名前だけが変わりました"
                : "差分が大きすぎるか、バイナリファイルのため表示できません。"}{" "}
              <button className="btn-link" onClick={() => openExternal(file.blob_url)}>
                GitHubで見る <LinkExternalIcon size={12} />
              </button>
            </div>
          ) : (
            <LazyRender estimate={Math.min(lines.length, 2000) * 20}>
              {() => (
                <DiffLines
                  lines={lines}
                  file={file}
                  pr={pr}
                  owner={owner}
                  repo={repo}
                  lineThreads={lineThreads}
                  pending={myPending}
                  setPending={setPending}
                />
              )}
            </LazyRender>
          )}
        </div>
      )}
    </section>
  );
});

function DiffLines({
  lines,
  file,
  pr,
  owner,
  repo,
  lineThreads,
  pending,
  setPending,
}: {
  lines: DiffLine[];
  file: PullFile;
  pr: PullDetail;
  owner: string;
  repo: string;
  lineThreads: Map<string, ReviewThread[]>;
  pending: PendingComment[];
  setPending: (fn: (p: PendingComment[]) => PendingComment[]) => void;
}) {
  const [commentAt, setCommentAt] = useState<string | null>(null);
  const canComment = pr.state === "OPEN";

  return (
    <div className="diff" role="table">
      {lines.map((l, i) => {
        if (l.kind === "hunk") {
          return (
            <div key={i} className="diff-line diff-hunk">
              <span className="diff-code">{l.text}</span>
            </div>
          );
        }
        if (l.kind === "meta") {
          return (
            <div key={i} className="diff-line diff-meta">
              <span className="diff-code fg-muted">{l.text}</span>
            </div>
          );
        }
        const a = lineAnchor(l)!;
        const key = anchorKey(a.side, a.line);
        const threads = lineThreads.get(key);
        const mine = pending.filter((p) => p.side === a.side && p.line === a.line);
        return (
          <div key={i} className="diff-row">
            <div className={`diff-line diff-${l.kind}`}>
              <button
                className="diff-num"
                disabled={!canComment}
                onClick={() => setCommentAt(commentAt === key ? null : key)}
                aria-label={`${a.line}行目にコメント`}
              >
                {l.oldNo ?? ""}
              </button>
              <button
                className="diff-num"
                disabled={!canComment}
                onClick={() => setCommentAt(commentAt === key ? null : key)}
                aria-label={`${a.line}行目にコメント`}
              >
                {l.newNo ?? ""}
              </button>
              <span className="diff-code">
                <span className="diff-marker">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
                {l.text || " "}
              </span>
            </div>
            {threads?.map((t) => (
              <div className="diff-inline" key={t.id}>
                <ReviewThreadView thread={t} owner={owner} repo={repo} number={pr.number} showContext={false} />
              </div>
            ))}
            {mine.map((p) => (
              <div className="diff-inline" key={p.id}>
                <div className="pending-comment">
                  <span className="badge-attention">保留中</span>
                  <pre className="pending-body">{p.body}</pre>
                  <button
                    className="btn-octicon"
                    aria-label="保留中のコメントを消す"
                    onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            ))}
            {commentAt === key && (
              <div className="diff-inline">
                <LineComposer
                  pr={pr}
                  owner={owner}
                  repo={repo}
                  path={file.filename}
                  side={a.side}
                  line={a.line}
                  onClose={() => setCommentAt(null)}
                  onPending={(body) =>
                    setPending((prev) => [
                      ...prev,
                      { id: Math.random().toString(36).slice(2), path: file.filename, side: a.side, line: a.line, body },
                    ])
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LineComposer({
  pr,
  owner,
  repo,
  path,
  side,
  line,
  onClose,
  onPending,
}: {
  pr: PullDetail;
  owner: string;
  repo: string;
  path: string;
  side: DiffSide;
  line: number;
  onClose: () => void;
  onPending: (body: string) => void;
}) {
  const { client } = useServices();
  const qc = useQueryClient();
  return (
    <div className="line-composer">
      <Composer
        draftKey={`line.${owner}/${repo}#${pr.number}:${path}:${side}:${line}`}
        context={`${owner}/${repo}`}
        autoFocus
        rows={3}
        submitLabel="レビューに追加"
        onCancel={onClose}
        onSubmit={async (text) => {
          onPending(text);
          onClose();
        }}
        extraActions={(text, clear) => (
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={async () => {
              await client.createReviewComment(owner, repo, pr.number, {
                commitId: pr.headRefOid,
                path,
                side,
                line,
                body: text,
              });
              clear();
              onClose();
              await refreshPull(qc, owner, repo, pr.number);
            }}
          >
            すぐにコメント
          </button>
        )}
      />
    </div>
  );
}

function FinishReview({
  pr,
  owner,
  repo,
  pending,
  onDone,
  onClose,
}: {
  pr: PullDetail;
  owner: string;
  repo: string;
  pending: PendingComment[];
  onDone: () => void;
  onClose: () => void;
}) {
  const { client } = useServices();
  const qc = useQueryClient();
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");

  const options: { value: ReviewEvent; label: string; text: string }[] = [
    { value: "COMMENT", label: "コメント", text: "承認せずに意見だけを送る" },
    ...(!pr.viewerDidAuthor
      ? [
          { value: "APPROVE" as const, label: "承認（Approve）", text: "マージしてよいと伝える" },
          { value: "REQUEST_CHANGES" as const, label: "修正を依頼（Request changes）", text: "マージ前に直してほしい点がある" },
        ]
      : []),
  ];

  return (
    <Sheet title="レビューを完了" onClose={onClose}>
      <div className="review-options">
        {options.map((o) => (
          <label key={o.value} className={`radio-row ${event === o.value ? "selected" : ""}`}>
            <input type="radio" name="event" checked={event === o.value} onChange={() => setEvent(o.value)} />
            <span>
              <span className="text-bold">{o.label}</span>
              <span className="fg-muted small d-block">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
      {pending.length > 0 && <p className="small">保留中の行コメント {pending.length}件も一緒に送ります。</p>}
      <Composer
        draftKey={`review.${owner}/${repo}#${pr.number}`}
        context={`${owner}/${repo}`}
        placeholder="全体へのコメント（任意）"
        submitLabel="レビューを送る"
        allowEmpty={event === "APPROVE" || pending.length > 0}
        onSubmit={async (body) => {
          await client.createReview(owner, repo, pr.number, {
            commitId: pr.headRefOid,
            event,
            body,
            comments: pending.map((p) => ({ path: p.path, line: p.line, side: p.side, body: p.body })),
          });
          onDone();
          onClose();
          await refreshPull(qc, owner, repo, pr.number);
        }}
      />
      <p className="fg-muted small">
        <FileDiffIcon size={12} /> head {pr.headRefOid.slice(0, 7)} に対するレビューになります。
      </p>
    </Sheet>
  );
}
