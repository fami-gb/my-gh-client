import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircleFillIcon,
  ChecklistIcon,
  CommentDiscussionIcon,
  DotFillIcon,
  EyeIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  LinkExternalIcon,
  PencilIcon,
  RepoPushIcon,
  TagIcon,
  TrashIcon,
  XCircleFillIcon,
  AlertIcon,
  PersonIcon,
  ChevronRightIcon,
} from "@primer/octicons-react";
import type { CheckContext, PullDetail, ReviewThread, TimelineItem } from "../lib/gql.ts";
import { READY_FOR_REVIEW } from "../lib/gql.ts";
import type { MergeMethod } from "../lib/github.ts";
import { href, pullHref, type PullTab } from "../lib/routes.ts";
import { checkRunTone, formatDuration, statusStateTone, summarizeTones, type Tone } from "../lib/status.ts";
import { Link } from "../router.tsx";
import { useServices } from "../services.tsx";
import {
  AppHeader,
  Avatar,
  Branch,
  ErrorBox,
  LabelChip,
  Loading,
  RelTime,
  Skeleton,
  StateLabel,
  ToneIcon,
  UnderlineNav,
} from "./components.tsx";
import { Composer } from "./Composer.tsx";
import { Markdown } from "./Markdown.tsx";
import { openExternal } from "./open.ts";
import { PreviewButton, usePreview, usePreviewConfig } from "./PreviewButton.tsx";
import { findPrRow, keys, usePullCommits, usePullDetail } from "./queries.ts";
import { ReviewThreadView } from "./ReviewThread.tsx";
import { refreshPull, useAction } from "./useAction.ts";

const FilesTab = lazy(() => import("./FilesTab.tsx"));

export function PullScreen({ owner, repo, number, tab }: { owner: string; repo: string; number: number; tab: PullTab }) {
  const qc = useQueryClient();
  const detail = usePullDetail(owner, repo, number);
  const pr = detail.data;
  const row = pr ? undefined : findPrRow(qc, owner, repo, number);
  const title = pr?.title ?? row?.title;
  const contexts = pr?.lastCommit.nodes[0]?.commit.statusCheckRollup?.contexts;

  const tabs = [
    {
      key: "conversation",
      label: "会話",
      href: pullHref(owner, repo, number),
      icon: <CommentDiscussionIcon size={16} />,
      count: pr?.totalCommentsCount ?? undefined,
    },
    {
      key: "commits",
      label: "コミット",
      href: pullHref(owner, repo, number, "commits"),
      icon: <GitCommitIcon size={16} />,
      count: pr?.commits.totalCount,
    },
    {
      key: "checks",
      label: "チェック",
      href: pullHref(owner, repo, number, "checks"),
      icon: <ChecklistIcon size={16} />,
      count: contexts?.totalCount,
    },
    {
      key: "files",
      label: "変更ファイル",
      href: pullHref(owner, repo, number, "files"),
      icon: <FileDiffIcon size={16} />,
      count: pr?.changedFiles,
      onIntent: () => void import("./FilesTab.tsx"),
    },
  ];

  return (
    <>
      <AppHeader
        context={`${owner}/${repo}`}
        title={`#${number}`}
        right={
          <button
            className="header-btn"
            aria-label="GitHubで開く"
            onClick={() => openExternal(`https://github.com/${owner}/${repo}/pull/${number}${tab === "conversation" ? "" : "/" + tab}`)}
          >
            <LinkExternalIcon size={18} />
          </button>
        }
      />
      <div className="page pr-head">
        <h1 className="pr-title">
          {title ?? <span className="skeleton" style={{ width: "70%", display: "inline-block" }} />}{" "}
          <span className="fg-muted pr-number">#{number}</span>
        </h1>
        <div className="pr-meta">
          {(pr ?? row) && <StateLabel state={(pr ?? row)!.state} isDraft={(pr ?? row)!.isDraft} />}
          {pr ? (
            <span className="fg-muted small">
              <strong className="fg-default">{pr.author?.login ?? "ghost"}</strong>
              {" が "}
              {pr.commits.totalCount}件のコミットを <Branch name={pr.baseRefName} /> ←{" "}
              <Branch name={pr.isCrossRepository && pr.headRepository ? `${pr.headRepository.nameWithOwner.split("/")[0]}:${pr.headRefName}` : pr.headRefName} />{" "}
              {pr.merged ? "にマージしました" : "にマージしたい"}
            </span>
          ) : row ? (
            <span className="fg-muted small">
              <strong className="fg-default">{row.author?.login}</strong> · <Branch name={row.baseRefName} /> ←{" "}
              <Branch name={row.headRefName} />
            </span>
          ) : null}
        </div>
      </div>
      <UnderlineNav items={tabs} active={tab} sticky />
      <main className="page">
        {detail.isError ? (
          <ErrorBox error={detail.error} retry={() => detail.refetch()} />
        ) : !pr ? (
          <Skeleton rows={6} />
        ) : tab === "conversation" ? (
          <Conversation pr={pr} owner={owner} repo={repo} />
        ) : tab === "commits" ? (
          <Commits owner={owner} repo={repo} number={number} />
        ) : tab === "checks" ? (
          <Checks pr={pr} owner={owner} repo={repo} />
        ) : (
          <Suspense fallback={<Loading />}>
            <FilesTab pr={pr} owner={owner} repo={repo} />
          </Suspense>
        )}
      </main>
    </>
  );
}

// ---------------- 会話 ----------------

function Conversation({ pr, owner, repo }: { pr: PullDetail; owner: string; repo: string }) {
  const { client } = useServices();
  const qc = useQueryClient();
  const n = pr.number;

  const threadsByReview = useMemo(() => {
    const map = new Map<string, ReviewThread[]>();
    for (const t of pr.reviewThreads.nodes) {
      const id = t.comments.nodes[0]?.pullRequestReview?.id;
      if (!id) continue;
      const list = map.get(id);
      if (list) list.push(t);
      else map.set(id, [t]);
    }
    return map;
  }, [pr.reviewThreads.nodes]);

  const hidden = pr.timelineItems.totalCount - pr.timelineItems.nodes.length;
  const canWrite = pr.baseRepository?.viewerPermission && pr.baseRepository.viewerPermission !== "READ";

  return (
    <div className="conversation">
      {pr.state === "OPEN" && <PreviewBox pr={pr} owner={owner} repo={repo} />}
      <Sidebar pr={pr} />
      <TimelineComment
        author={pr.author}
        createdAt={pr.createdAt}
        html={pr.bodyHTML}
        badge="作成者"
        actions={
          pr.viewerCanUpdate ? (
            <button className="btn-octicon" aria-label="説明を編集" onClick={() => openExternal(pr.url)}>
              <PencilIcon size={14} />
            </button>
          ) : null
        }
      />
      <div className="timeline">
        {hidden > 0 && (
          <div className="timeline-item">
            <span className="timeline-badge">…</span>
            <span className="fg-muted small">
              これより前の {hidden} 件は{" "}
              <button className="btn-link" onClick={() => openExternal(pr.url)}>
                GitHubで見る
              </button>
            </span>
          </div>
        )}
        {pr.timelineItems.nodes.map((item) => (
          <TimelineEntry
            key={item.id}
            item={item}
            pr={pr}
            owner={owner}
            repo={repo}
            threads={item.__typename === "PullRequestReview" ? threadsByReview.get(item.id) : undefined}
          />
        ))}
      </div>
      <MergeBox pr={pr} owner={owner} repo={repo} />
      <div className="new-comment">
        <Composer
          draftKey={`pr.${owner}/${repo}#${n}`}
          context={`${owner}/${repo}`}
          onSubmit={async (text) => {
            await client.createIssueComment(owner, repo, n, text);
            await refreshPull(qc, owner, repo, n);
          }}
          extraActions={(text, clear) =>
            canWrite || pr.viewerDidAuthor ? (
              pr.state === "OPEN" ? (
                <button
                  className="btn"
                  onClick={async () => {
                    if (!confirm("このPRをクローズしますか？")) return;
                    if (text.trim()) await client.createIssueComment(owner, repo, n, text);
                    await client.updatePull(owner, repo, n, { state: "closed" });
                    clear();
                    await refreshPull(qc, owner, repo, n);
                  }}
                >
                  <GitPullRequestClosedIcon size={16} className="fg-danger" />
                  {text.trim() ? "コメントしてクローズ" : "クローズ"}
                </button>
              ) : pr.state === "CLOSED" ? (
                <button
                  className="btn"
                  onClick={async () => {
                    if (text.trim()) await client.createIssueComment(owner, repo, n, text);
                    await client.updatePull(owner, repo, n, { state: "open" });
                    clear();
                    await refreshPull(qc, owner, repo, n);
                  }}
                >
                  再オープン
                </button>
              ) : null
            ) : null
          }
        />
      </div>
    </div>
  );
}

function PreviewBox({ pr, owner, repo }: { pr: PullDetail; owner: string; repo: string }) {
  const config = usePreviewConfig(owner, repo);
  const input = { owner, repo, number: pr.number, headSha: pr.headRefOid, headRef: pr.headRefName };
  const q = usePreview(input, config);
  const [open, setOpen] = useState(false);
  const s = q.data;
  const all = s ? (s.kind === "ready" ? [...s.targets, ...s.others] : s.others) : [];
  return (
    <div className="preview-box">
      <PreviewButton input={input} config={config} />
      {s && (
        <button className="btn-link small" onClick={() => setOpen(!open)}>
          {open ? "詳細を閉じる" : "どこから見つけたか"}
        </button>
      )}
      {open && s && (
        <div className="small fg-muted preview-details">
          {all.length === 0 ? (
            <p>このコミットのデプロイも、ボットのプレビューコメントも見つかりませんでした。設定の環境名やボット名を確認してください。</p>
          ) : (
            <ul>
              {all.map((t, i) => (
                <li key={i}>
                  <strong>{t.label}</strong>（{t.source === "deployment" ? "Deployments" : "ボットのコメント"}）:{" "}
                  {{ ready: "公開中", pending: "準備中", failed: "失敗", inactive: "無効" }[t.state]} ·{" "}
                  <RelTime iso={t.updatedAt} />
                  {t.logUrl && (
                    <>
                      {" "}
                      <button className="btn-link" onClick={() => openExternal(t.logUrl!)}>
                        ログ
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const REVIEW_STATE_ICON: Record<string, ReactNode> = {
  APPROVED: <CheckCircleFillIcon size={16} className="fg-success" aria-label="承認" />,
  CHANGES_REQUESTED: <XCircleFillIcon size={16} className="fg-danger" aria-label="修正依頼" />,
  COMMENTED: <CommentDiscussionIcon size={16} className="fg-muted" aria-label="コメント" />,
  DISMISSED: <DotFillIcon size={16} className="fg-muted" aria-label="取り消し" />,
};

function Sidebar({ pr }: { pr: PullDetail }) {
  const reviewers = [
    ...pr.latestReviews.nodes.map((r) => ({ login: r.author?.login ?? "ghost", avatar: r.author?.avatarUrl, state: r.state })),
    ...pr.reviewRequests.nodes
      .map((r) => r.requestedReviewer)
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ login: r.login ?? r.name ?? "?", avatar: r.avatarUrl, state: "PENDING" })),
  ];
  return (
    <div className="sidebar-box">
      <div className="sidebar-row">
        <span className="sidebar-label">
          <EyeIcon size={14} /> レビュアー
        </span>
        <span className="sidebar-value">
          {reviewers.length === 0 ? (
            <span className="fg-muted">なし</span>
          ) : (
            reviewers.map((r) => (
              <span key={r.login} className="person">
                <Avatar src={r.avatar} login={r.login} size={18} />
                {r.login}
                {REVIEW_STATE_ICON[r.state] ?? <DotFillIcon size={14} className="fg-attention" aria-label="レビュー待ち" />}
              </span>
            ))
          )}
        </span>
      </div>
      <div className="sidebar-row">
        <span className="sidebar-label">
          <PersonIcon size={14} /> 担当者
        </span>
        <span className="sidebar-value">
          {pr.assignees.nodes.length === 0 ? (
            <span className="fg-muted">なし</span>
          ) : (
            pr.assignees.nodes.map((a) => (
              <span key={a.login} className="person">
                <Avatar src={a.avatarUrl} login={a.login} size={18} />
                {a.login}
              </span>
            ))
          )}
        </span>
      </div>
      {pr.labels.nodes.length > 0 && (
        <div className="sidebar-row">
          <span className="sidebar-label">
            <TagIcon size={14} /> ラベル
          </span>
          <span className="sidebar-value">
            {pr.labels.nodes.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function TimelineComment({
  author,
  createdAt,
  html,
  badge,
  actions,
  edited,
  tone,
  headText,
}: {
  author: { login: string; avatarUrl: string } | null;
  createdAt: string;
  html: string;
  badge?: string;
  actions?: ReactNode;
  edited?: boolean;
  tone?: "default" | "approved" | "changes";
  headText?: ReactNode;
}) {
  return (
    <div className={`timeline-comment tone-${tone ?? "default"}`}>
      <div className="timeline-comment-header">
        <Avatar src={author?.avatarUrl} login={author?.login} size={24} />
        <span className="grow min0">
          <strong>{author?.login ?? "ghost"}</strong> <span className="fg-muted small">{headText}</span>
          <span className="fg-muted small">
            <RelTime iso={createdAt} />
            {edited && " · 編集済み"}
          </span>
        </span>
        {badge && <span className="badge-outline">{badge}</span>}
        {actions}
      </div>
      <div className="timeline-comment-body">
        <Markdown html={html} />
      </div>
    </div>
  );
}

function EventRow({ icon, children, at, tone }: { icon: ReactNode; children: ReactNode; at: string; tone?: string }) {
  return (
    <div className="timeline-item">
      <span className={`timeline-badge ${tone ?? ""}`}>{icon}</span>
      <span className="timeline-text">
        {children} <span className="fg-muted">
          <RelTime iso={at} />
        </span>
      </span>
    </div>
  );
}

function who(a: { login: string } | null) {
  return <strong>{a?.login ?? "ghost"}</strong>;
}

function TimelineEntry({
  item,
  pr,
  owner,
  repo,
  threads,
}: {
  item: TimelineItem;
  pr: PullDetail;
  owner: string;
  repo: string;
  threads?: ReviewThread[];
}) {
  const { client } = useServices();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  switch (item.__typename) {
    case "IssueComment":
      if (editing) {
        return (
          <div className="timeline-comment">
            <Composer
              initial={item.body}
              context={`${owner}/${repo}`}
              submitLabel="更新"
              autoFocus
              onCancel={() => setEditing(false)}
              onSubmit={async (text) => {
                await client.updateIssueComment(owner, repo, item.databaseId, text);
                setEditing(false);
                await refreshPull(qc, owner, repo, pr.number);
              }}
            />
          </div>
        );
      }
      return (
        <TimelineComment
          author={item.author}
          createdAt={item.createdAt}
          html={item.bodyHTML}
          edited={!!item.lastEditedAt}
          badge={item.author?.login === pr.author?.login ? "作成者" : undefined}
          actions={
            <>
              {item.viewerCanUpdate && (
                <button className="btn-octicon" aria-label="編集" onClick={() => setEditing(true)}>
                  <PencilIcon size={14} />
                </button>
              )}
              {item.viewerCanDelete && (
                <button
                  className="btn-octicon"
                  aria-label="削除"
                  onClick={async () => {
                    if (!confirm("このコメントを削除しますか？")) return;
                    await client.deleteIssueComment(owner, repo, item.databaseId);
                    await refreshPull(qc, owner, repo, pr.number);
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </>
          }
        />
      );
    case "PullRequestReview": {
      const label =
        item.state === "APPROVED"
          ? "が承認しました"
          : item.state === "CHANGES_REQUESTED"
            ? "が修正を依頼しました"
            : item.state === "DISMISSED"
              ? "のレビュー（取り消し）"
              : "がレビューしました";
      const icon =
        item.state === "APPROVED" ? (
          <CheckCircleFillIcon size={16} />
        ) : item.state === "CHANGES_REQUESTED" ? (
          <XCircleFillIcon size={16} />
        ) : (
          <EyeIcon size={16} />
        );
      const tone = item.state === "APPROVED" ? "badge-success" : item.state === "CHANGES_REQUESTED" ? "badge-danger" : "";
      return (
        <>
          <EventRow icon={icon} tone={tone} at={item.submittedAt ?? item.createdAt}>
            <Avatar src={item.author?.avatarUrl} login={item.author?.login} size={16} /> {who(item.author)} {label}
          </EventRow>
          {item.body.trim() && (
            <TimelineComment
              author={item.author}
              createdAt={item.submittedAt ?? item.createdAt}
              html={item.bodyHTML}
              tone={item.state === "APPROVED" ? "approved" : item.state === "CHANGES_REQUESTED" ? "changes" : "default"}
            />
          )}
          {threads?.map((t) => (
            <ReviewThreadView key={t.id} thread={t} owner={owner} repo={repo} number={pr.number} showContext />
          ))}
        </>
      );
    }
    case "PullRequestCommit": {
      const c = item.commit;
      return (
        <div className="timeline-item timeline-commit">
          <span className="timeline-badge">
            <GitCommitIcon size={16} />
          </span>
          <Avatar src={c.author?.user?.avatarUrl} login={c.author?.user?.login} size={16} />
          <span className="timeline-text grow min0 ellipsis">{c.messageHeadline}</span>
          {c.statusCheckRollup && <ToneIcon tone={statusStateTone(c.statusCheckRollup.state)} size={14} />}
          <code className="sha">{c.abbreviatedOid}</code>
        </div>
      );
    }
    case "HeadRefForcePushedEvent":
      return (
        <EventRow icon={<RepoPushIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} が force-push しました（{item.beforeCommit?.abbreviatedOid ?? "?"} → {item.afterCommit?.abbreviatedOid ?? "?"}）
        </EventRow>
      );
    case "MergedEvent":
      return (
        <EventRow icon={<GitMergeIcon size={16} />} tone="badge-done" at={item.createdAt}>
          {who(item.actor)} が {item.mergeCommit?.abbreviatedOid} を <Branch name={item.mergeRefName} /> にマージしました
        </EventRow>
      );
    case "ClosedEvent":
      return (
        <EventRow icon={<GitPullRequestClosedIcon size={16} />} tone="badge-danger" at={item.createdAt}>
          {who(item.actor)} がクローズしました
        </EventRow>
      );
    case "ReopenedEvent":
      return (
        <EventRow icon={<GitPullRequestIcon size={16} />} tone="badge-success" at={item.createdAt}>
          {who(item.actor)} が再オープンしました
        </EventRow>
      );
    case "LabeledEvent":
    case "UnlabeledEvent":
      return (
        <EventRow icon={<TagIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} が <LabelChip label={item.label} /> を{item.__typename === "LabeledEvent" ? "付けました" : "外しました"}
        </EventRow>
      );
    case "ReviewRequestedEvent":
      return (
        <EventRow icon={<EyeIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} が {item.requestedReviewer?.login ?? item.requestedReviewer?.name ?? "?"} にレビューを依頼しました
        </EventRow>
      );
    case "ReadyForReviewEvent":
      return (
        <EventRow icon={<EyeIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} がレビュー可能にしました
        </EventRow>
      );
    case "ConvertToDraftEvent":
      return (
        <EventRow icon={<GitPullRequestIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} が下書きに戻しました
        </EventRow>
      );
    case "AssignedEvent":
      return (
        <EventRow icon={<PersonIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} が {item.assignee?.login ?? "?"} を担当にしました
        </EventRow>
      );
    case "HeadRefDeletedEvent":
      return (
        <EventRow icon={<GitBranchIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} がブランチ <Branch name={item.headRefName} /> を削除しました
        </EventRow>
      );
    case "RenamedTitleEvent":
      return (
        <EventRow icon={<PencilIcon size={16} />} at={item.createdAt}>
          {who(item.actor)} がタイトルを <del>{item.previousTitle}</del> → {item.currentTitle} に変えました
        </EventRow>
      );
    default:
      return null;
  }
}

// ---------------- マージ ----------------

const METHOD_LABEL: Record<MergeMethod, string> = {
  merge: "マージコミット",
  squash: "スカッシュ",
  rebase: "リベース",
};

function MergeBox({ pr, owner, repo }: { pr: PullDetail; owner: string; repo: string }) {
  const { client } = useServices();
  const qc = useQueryClient();
  const act = useAction();
  const repoSettings = pr.baseRepository;
  const methods = (["squash", "merge", "rebase"] as MergeMethod[]).filter((m) =>
    m === "merge" ? repoSettings?.mergeCommitAllowed : m === "squash" ? repoSettings?.squashMergeAllowed : repoSettings?.rebaseMergeAllowed,
  );
  const defaultMethod = (repoSettings?.viewerDefaultMergeMethod?.toLowerCase() ?? "merge") as MergeMethod;
  const [method, setMethod] = useState<MergeMethod>(methods.includes(defaultMethod) ? defaultMethod : (methods[0] ?? "merge"));
  const [confirming, setConfirming] = useState(false);
  const [commitTitle, setCommitTitle] = useState("");
  const canWrite = !!repoSettings?.viewerPermission && !["READ", "TRIAGE"].includes(repoSettings.viewerPermission);
  const branchDeleted = pr.timelineItems.nodes.some((i) => i.__typename === "HeadRefDeletedEvent");

  const contexts = pr.lastCommit.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  const tones = contexts.map(contextTone);
  const checks = summarizeTones(tones);

  if (pr.merged) {
    return (
      <div className="merge-box merged">
        <div className="merge-icon state-bg-merged">
          <GitMergeIcon size={20} />
        </div>
        <div className="merge-body">
          <div className="text-bold">マージ済み</div>
          <div className="fg-muted small">
            {pr.mergedBy?.login ?? "?"} が <RelTime iso={pr.mergedAt} /> にマージしました
          </div>
          {canWrite && !branchDeleted && !pr.isCrossRepository && (
            <button
              className="btn btn-sm"
              disabled={!!act.busy}
              onClick={() =>
                act.run("delete", async () => {
                  if (!confirm(`ブランチ ${pr.headRefName} を削除しますか？`)) return;
                  await client.deleteBranch(owner, repo, pr.headRefName);
                  await refreshPull(qc, owner, repo, pr.number);
                })
              }
            >
              <TrashIcon size={14} /> ブランチを削除
            </button>
          )}
          {act.error && <p className="fg-danger small">{act.error}</p>}
        </div>
      </div>
    );
  }
  if (pr.state === "CLOSED") {
    return (
      <div className="merge-box">
        <div className="merge-icon state-bg-closed">
          <GitPullRequestClosedIcon size={20} />
        </div>
        <div className="merge-body">
          <div className="text-bold">クローズ済み（マージされていません）</div>
        </div>
      </div>
    );
  }

  const status = pr.mergeStateStatus;
  const mergeable =
    pr.mergeable === "MERGEABLE" && (status === "CLEAN" || status === "UNSTABLE" || status === "HAS_HOOKS" || status === "BLOCKED");
  const statusRow: { tone: Tone; title: string; text?: string } =
    pr.isDraft || status === "DRAFT"
      ? { tone: "neutral", title: "下書きです", text: "レビュー可能にするとマージできます" }
      : pr.mergeable === "CONFLICTING" || status === "DIRTY"
        ? { tone: "failure", title: "コンフリクトがあります", text: "GitHubかローカルで解決してください" }
        : status === "BEHIND"
          ? { tone: "pending", title: "ベースブランチより遅れています", text: "ブランチを更新してください" }
          : status === "BLOCKED"
            ? { tone: "failure", title: "マージがブロックされています", text: "必要なレビューやチェックが足りません" }
            : status === "UNKNOWN" || pr.mergeable === "UNKNOWN"
              ? { tone: "pending", title: "マージできるか確認中…" }
              : status === "UNSTABLE"
                ? { tone: "pending", title: "失敗したチェックがありますが、マージはできます" }
                : { tone: "success", title: "コンフリクトはありません", text: "マージできます" };

  const reviewRow =
    pr.reviewDecision === "APPROVED"
      ? { tone: "success" as Tone, title: "承認されています" }
      : pr.reviewDecision === "CHANGES_REQUESTED"
        ? { tone: "failure" as Tone, title: "修正を依頼されています" }
        : pr.reviewDecision === "REVIEW_REQUIRED"
          ? { tone: "pending" as Tone, title: "レビューが必要です" }
          : null;

  async function doMerge() {
    await act.run("merge", async () => {
      await client.mergePull(owner, repo, pr.number, {
        method,
        sha: pr.headRefOid,
        title: method === "rebase" ? undefined : commitTitle || undefined,
      });
      setConfirming(false);
      await refreshPull(qc, owner, repo, pr.number);
    });
  }

  return (
    <div className={`merge-box ${statusRow.tone === "success" ? "ready" : ""}`}>
      <div className={`merge-icon ${mergeable ? "state-bg-open" : "state-bg-draft"}`}>
        <GitMergeIcon size={20} />
      </div>
      <div className="merge-body">
        {reviewRow && (
          <div className="merge-row">
            <ToneIcon tone={reviewRow.tone} />
            <span className="text-bold">{reviewRow.title}</span>
          </div>
        )}
        {contexts.length > 0 && (
          <Link className="merge-row merge-row-link" href={pullHref(owner, repo, pr.number, "checks")}>
            <ToneIcon tone={checks.overall} />
            <span className="grow">
              <span className="text-bold">
                {checks.overall === "success"
                  ? "すべてのチェックが成功しました"
                  : checks.overall === "failure"
                    ? "失敗したチェックがあります"
                    : checks.overall === "pending"
                      ? "チェック実行中"
                      : "チェック"}
              </span>
              <span className="fg-muted small d-block">{checks.text}</span>
            </span>
            <ChevronRightIcon size={16} />
          </Link>
        )}
        <div className="merge-row">
          <ToneIcon tone={statusRow.tone} />
          <span className="grow">
            <span className="text-bold">{statusRow.title}</span>
            {statusRow.text && <span className="fg-muted small d-block">{statusRow.text}</span>}
          </span>
          {status === "BEHIND" && canWrite && (
            <button
              className="btn btn-sm"
              disabled={!!act.busy}
              onClick={() =>
                act.run("update", async () => {
                  await client.updatePullBranch(owner, repo, pr.number, pr.headRefOid);
                  setTimeout(() => void refreshPull(qc, owner, repo, pr.number), 3000);
                })
              }
            >
              {act.busy === "update" ? "更新中…" : "ブランチを更新"}
            </button>
          )}
        </div>
        {(pr.isDraft || status === "DRAFT") && (pr.viewerCanUpdate || canWrite) ? (
          <button
            className="btn btn-block"
            disabled={!!act.busy}
            onClick={() =>
              act.run("ready", async () => {
                await client.graphql(READY_FOR_REVIEW, { id: pr.id });
                await refreshPull(qc, owner, repo, pr.number);
              })
            }
          >
            {act.busy === "ready" ? "変更中…" : "レビュー可能にする（Ready for review）"}
          </button>
        ) : canWrite && methods.length > 0 ? (
          confirming ? (
            <div className="merge-confirm">
              {method !== "rebase" && (
                <label className="form-field">
                  コミットのタイトル
                  <input
                    value={commitTitle}
                    onChange={(e) => setCommitTitle(e.target.value)}
                    placeholder={method === "squash" ? `${pr.title} (#${pr.number})` : `Merge pull request #${pr.number}`}
                  />
                </label>
              )}
              <div className="row-gap">
                <button className="btn" onClick={() => setConfirming(false)} disabled={!!act.busy}>
                  キャンセル
                </button>
                <button className="btn btn-primary grow" onClick={doMerge} disabled={!!act.busy}>
                  {act.busy === "merge" ? "マージ中…" : "マージを確定"}
                </button>
              </div>
            </div>
          ) : (
            <div className="merge-actions">
              <select value={method} onChange={(e) => setMethod(e.target.value as MergeMethod)} aria-label="マージの方法">
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
              <button
                className={`btn ${mergeable && status !== "BLOCKED" ? "btn-primary" : ""}`}
                disabled={!mergeable}
                onClick={() => setConfirming(true)}
              >
                <GitMergeIcon size={16} />
                {status === "BLOCKED" ? "マージを試す" : "マージ"}
              </button>
            </div>
          )
        ) : !canWrite ? (
          <p className="fg-muted small">このリポジトリへの書き込み権限が無いため、マージできません。</p>
        ) : null}
        {act.error && (
          <p className="fg-danger small">
            <AlertIcon size={14} /> {act.error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------- コミット ----------------

function Commits({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const q = usePullCommits(owner, repo, number);
  if (q.isPending) return <Skeleton rows={6} />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  const groups = new Map<string, typeof q.data.nodes>();
  for (const c of q.data.nodes) {
    const day = new Date(c.commit.committedDate).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
    const g = groups.get(day);
    if (g) g.push(c);
    else groups.set(day, [c]);
  }
  return (
    <div className="commits">
      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <h3 className="commit-day">
            <GitCommitIcon size={16} /> {day} のコミット
          </h3>
          <div className="box">
            {list.map(({ commit: c }) => (
              <button key={c.oid} className="box-row box-row-button" onClick={() => openExternal(c.url)}>
                <div className="grow min0">
                  <div className="text-bold ellipsis-2">{c.messageHeadline}</div>
                  <div className="fg-muted small row-meta">
                    <Avatar src={c.author?.user?.avatarUrl} login={c.author?.user?.login} size={14} />{" "}
                    {c.author?.user?.login ?? c.author?.name ?? "?"} · <RelTime iso={c.committedDate} />
                  </div>
                </div>
                {c.statusCheckRollup && <ToneIcon tone={statusStateTone(c.statusCheckRollup.state)} size={14} />}
                <code className="sha">{c.abbreviatedOid}</code>
              </button>
            ))}
          </div>
        </section>
      ))}
      {q.data.totalCount > q.data.nodes.length && (
        <p className="fg-muted small">ほかに {q.data.totalCount - q.data.nodes.length} 件あります（GitHubで確認してください）</p>
      )}
    </div>
  );
}

// ---------------- チェック ----------------

function contextTone(c: CheckContext): Tone {
  return c.__typename === "CheckRun" ? checkRunTone(c.status, c.conclusion) : statusStateTone(c.state);
}

function Checks({ pr, owner, repo }: { pr: PullDetail; owner: string; repo: string }) {
  const qc = useQueryClient();
  const contexts = pr.lastCommit.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  if (contexts.length === 0) {
    return (
      <div className="blankslate">
        <ChecklistIcon size={24} />
        <p>最新のコミットにチェックはありません</p>
      </div>
    );
  }
  const order: Tone[] = ["failure", "action", "running", "pending", "cancelled", "neutral", "success", "skipped"];
  const sorted = [...contexts].sort((a, b) => order.indexOf(contextTone(a)) - order.indexOf(contextTone(b)));
  const summary = summarizeTones(contexts.map(contextTone));

  return (
    <div className="box">
      <div className="box-header">
        <ToneIcon tone={summary.overall} />
        <span className="text-bold">{summary.text}</span>
        <button
          className="btn btn-sm push-right"
          onClick={() => void qc.invalidateQueries({ queryKey: keys.pull(owner, repo, pr.number) })}
        >
          更新
        </button>
      </div>
      {sorted.map((c, i) => {
        const tone = contextTone(c);
        if (c.__typename === "CheckRun") {
          const run = c.checkSuite?.workflowRun;
          const inner = (
            <>
              <ToneIcon tone={tone} />
              <div className="grow min0">
                <div className="ellipsis">
                  {run ? <span className="fg-muted">{run.workflow.name} / </span> : null}
                  <span className="text-bold">{c.name}</span>
                </div>
                <div className="fg-muted small">
                  {c.checkSuite?.app?.name ?? ""} {c.startedAt ? `· ${formatDuration(c.startedAt, c.completedAt)}` : ""}
                </div>
              </div>
              <ChevronRightIcon size={16} />
            </>
          );
          return run && c.databaseId ? (
            <Link
              key={i}
              className="box-row box-row-button"
              href={href({ name: "job", owner, repo, runId: run.databaseId, jobId: c.databaseId })}
            >
              {inner}
            </Link>
          ) : (
            <button key={i} className="box-row box-row-button" onClick={() => c.detailsUrl && openExternal(c.detailsUrl)}>
              {inner}
            </button>
          );
        }
        return (
          <button key={i} className="box-row box-row-button" onClick={() => c.targetUrl && openExternal(c.targetUrl)}>
            <ToneIcon tone={tone} />
            <div className="grow min0">
              <div className="text-bold ellipsis">{c.context}</div>
              {c.description && <div className="fg-muted small ellipsis">{c.description}</div>}
            </div>
            {c.targetUrl && <LinkExternalIcon size={16} />}
          </button>
        );
      })}
    </div>
  );
}
