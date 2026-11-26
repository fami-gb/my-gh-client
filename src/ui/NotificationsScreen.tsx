import { useQueryClient } from "@tanstack/react-query";
import {
  BellSlashIcon,
  CheckIcon,
  CommentDiscussionIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  InboxIcon,
  IssueOpenedIcon,
  PlayIcon,
  ShieldIcon,
  TagIcon,
  BellIcon,
} from "@primer/octicons-react";
import { GitHubError, type Notification } from "../lib/github.ts";
import { groupByRepo, notificationHref, notificationWebUrl, REASON_LABEL } from "../lib/notifications.ts";
import { href } from "../lib/routes.ts";
import { Link, navigate } from "../router.tsx";
import { useServices } from "../services.tsx";
import { AppHeader, ErrorBox, RelTime, Skeleton } from "./components.tsx";
import { MyWork } from "./HomeScreen.tsx";
import { openExternal } from "./open.ts";
import { keys, useNotifications, useViewerLogin } from "./queries.ts";

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "PullRequest":
      return <GitPullRequestIcon size={16} />;
    case "Issue":
      return <IssueOpenedIcon size={16} />;
    case "CheckSuite":
    case "WorkflowRun":
      return <PlayIcon size={16} />;
    case "Release":
      return <TagIcon size={16} />;
    case "Discussion":
      return <CommentDiscussionIcon size={16} />;
    case "Commit":
      return <GitCommitIcon size={16} />;
    case "RepositoryVulnerabilityAlert":
    case "RepositoryDependabotAlertsThread":
      return <ShieldIcon size={16} />;
    default:
      return <BellIcon size={16} />;
  }
}

export function NotificationsScreen({ all }: { all: boolean }) {
  const { client } = useServices();
  const qc = useQueryClient();
  const q = useNotifications(all);
  const login = useViewerLogin();
  const unsupported = q.error instanceof GitHubError && (q.error.status === 403 || q.error.status === 404);

  function removeLocal(id: string, mode: "read" | "done") {
    for (const a of [false, true]) {
      qc.setQueryData<Notification[]>(keys.notifications(a), (old) =>
        old
          ? mode === "done" || !a
            ? old.filter((n) => n.id !== id)
            : old.map((n) => (n.id === id ? { ...n, unread: false } : n))
          : old,
      );
    }
  }

  async function markRead(n: Notification) {
    removeLocal(n.id, "read");
    try {
      await client.markNotificationRead(n.id);
    } catch {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  async function markDone(n: Notification) {
    removeLocal(n.id, "done");
    try {
      await client.markNotificationDone(n.id);
    } catch {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  function open(n: Notification) {
    if (n.unread) void markRead(n);
    const inApp = notificationHref(n);
    if (inApp) navigate(inApp);
    else openExternal(notificationWebUrl(n));
  }

  const groups = q.data ? groupByRepo(q.data) : [];

  return (
    <>
      <AppHeader
        back={false}
        title="通知"
        right={
          q.data && q.data.some((n) => n.unread) ? (
            <button
              className="btn btn-sm"
              onClick={async () => {
                if (!confirm("すべて既読にしますか？")) return;
                await client.markAllNotificationsRead();
                await qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              <CheckIcon size={14} /> すべて既読
            </button>
          ) : null
        }
      />
      <main className="page">
        {!unsupported && (
          <div className="segmented" role="tablist">
            <Link href={href({ name: "notifications" })} replace className={!all ? "selected" : ""}>
              未読
            </Link>
            <Link href={href({ name: "notifications", all: true })} replace className={all ? "selected" : ""}>
              すべて
            </Link>
          </div>
        )}
        {q.isPending ? (
          <Skeleton rows={6} />
        ) : unsupported ? (
          <>
            <div className="flash flash-info">
              <BellSlashIcon size={16} />
              <div className="flash-body">
                <div>
                  GitHubの通知APIは <strong>クラシックPAT</strong>（notifications か repo スコープ）でしか使えません。Fine-grained
                  PAT では代わりに「あなたの作業」を出します。
                </div>
                <Link className="btn btn-sm" href="#/settings">
                  トークンを変える
                </Link>
              </div>
            </div>
            <MyWork login={login} />
          </>
        ) : q.isError ? (
          <ErrorBox error={q.error} retry={() => q.refetch()} />
        ) : groups.length === 0 ? (
          <div className="blankslate">
            <InboxIcon size={32} />
            <p className="text-bold">{all ? "通知はありません" : "未読はありません"}</p>
            <p className="fg-muted small">おつかれさまでした</p>
          </div>
        ) : (
          groups.map((g) => (
            <div className="box" key={g.repo}>
              <div className="box-header">
                <Link className="text-bold" href={href({ name: "pulls", owner: g.repo.split("/")[0], repo: g.repo.split("/")[1], state: "open", q: "" })}>
                  {g.repo}
                </Link>
              </div>
              {g.items.map((n) => (
                <div className={`box-row notif-row ${n.unread ? "unread" : ""}`} key={n.id}>
                  <span className="notif-icon">
                    <TypeIcon type={n.subject.type} />
                  </span>
                  <button className="grow min0 notif-main" onClick={() => open(n)}>
                    <span className="ellipsis-2 notif-title">{n.subject.title}</span>
                    <span className="fg-muted small">
                      {REASON_LABEL[n.reason] ?? n.reason} · <RelTime iso={n.updated_at} />
                    </span>
                  </button>
                  <span className="notif-actions">
                    {n.unread && (
                      <button className="btn-octicon" aria-label="既読にする" title="既読にする" onClick={() => markRead(n)}>
                        <span className="unread-dot" />
                      </button>
                    )}
                    <button className="btn-octicon" aria-label="完了にする" title="完了（Done）" onClick={() => markDone(n)}>
                      <CheckIcon size={16} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </main>
    </>
  );
}
