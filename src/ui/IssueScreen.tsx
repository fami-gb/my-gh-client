import { useQueryClient } from "@tanstack/react-query";
import { IssueClosedIcon, IssueReopenedIcon, LinkExternalIcon } from "@primer/octicons-react";
import { useServices } from "../services.tsx";
import { AppHeader, Avatar, ErrorBox, IssueStateLabel, LabelChip, RelTime, Skeleton } from "./components.tsx";
import { Composer } from "./Composer.tsx";
import { Markdown } from "./Markdown.tsx";
import { openExternal } from "./open.ts";
import { keys, useIssue } from "./queries.ts";

// Issue（通知から開いたとき用の簡易版）：本文・コメント・返信・クローズ

export function IssueScreen({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const q = useIssue(owner, repo, number);
  const { client } = useServices();
  const qc = useQueryClient();
  const issue = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: keys.issue(owner, repo, number) });

  return (
    <>
      <AppHeader
        context={`${owner}/${repo}`}
        title={`#${number}`}
        right={
          <button
            className="header-btn"
            aria-label="GitHubで開く"
            onClick={() => openExternal(`https://github.com/${owner}/${repo}/issues/${number}`)}
          >
            <LinkExternalIcon size={18} />
          </button>
        }
      />
      <main className="page">
        {q.isError ? (
          <ErrorBox error={q.error} retry={() => q.refetch()} />
        ) : !issue ? (
          <Skeleton rows={5} />
        ) : (
          <>
            <h1 className="pr-title">
              {issue.title} <span className="fg-muted pr-number">#{number}</span>
            </h1>
            <div className="pr-meta">
              <IssueStateLabel state={issue.state} reason={issue.stateReason} />
              <span className="fg-muted small">
                <strong className="fg-default">{issue.author?.login ?? "ghost"}</strong> が <RelTime iso={issue.createdAt} /> に作成 ·
                コメント {issue.comments.totalCount}件
              </span>
            </div>
            {issue.labels.nodes.length > 0 && (
              <div className="row-labels">
                {issue.labels.nodes.map((l) => (
                  <LabelChip key={l.name} label={l} />
                ))}
              </div>
            )}
            <div className="timeline-comment">
              <div className="timeline-comment-header">
                <Avatar src={issue.author?.avatarUrl} login={issue.author?.login} size={24} />
                <strong className="grow">{issue.author?.login ?? "ghost"}</strong>
                <span className="badge-outline">作成者</span>
              </div>
              <div className="timeline-comment-body">
                <Markdown html={issue.bodyHTML} />
              </div>
            </div>
            {issue.comments.totalCount > issue.comments.nodes.length && (
              <p className="fg-muted small">
                これより前のコメント {issue.comments.totalCount - issue.comments.nodes.length}件は GitHub で見てください。
              </p>
            )}
            {issue.comments.nodes.map((c) => (
              <div className="timeline-comment" key={c.id}>
                <div className="timeline-comment-header">
                  <Avatar src={c.author?.avatarUrl} login={c.author?.login} size={24} />
                  <span className="grow">
                    <strong>{c.author?.login ?? "ghost"}</strong>{" "}
                    <span className="fg-muted small">
                      <RelTime iso={c.createdAt} />
                    </span>
                  </span>
                  {c.author?.login === issue.author?.login && <span className="badge-outline">作成者</span>}
                </div>
                <div className="timeline-comment-body">
                  <Markdown html={c.bodyHTML} />
                </div>
              </div>
            ))}
            <div className="new-comment">
              <Composer
                draftKey={`issue.${owner}/${repo}#${number}`}
                context={`${owner}/${repo}`}
                onSubmit={async (text) => {
                  await client.createIssueComment(owner, repo, number, text);
                  await refresh();
                }}
                extraActions={(text, clear) =>
                  issue.viewerCanUpdate ? (
                    <button
                      className="btn"
                      onClick={async () => {
                        if (text.trim()) await client.createIssueComment(owner, repo, number, text);
                        await client.updateIssue(owner, repo, number, {
                          state: issue.state === "OPEN" ? "closed" : "open",
                          ...(issue.state === "OPEN" ? { state_reason: "completed" } : {}),
                        });
                        clear();
                        await refresh();
                      }}
                    >
                      {issue.state === "OPEN" ? (
                        <>
                          <IssueClosedIcon size={16} className="fg-done" /> クローズ
                        </>
                      ) : (
                        <>
                          <IssueReopenedIcon size={16} /> 再オープン
                        </>
                      )}
                    </button>
                  ) : null
                }
              />
            </div>
          </>
        )}
      </main>
    </>
  );
}
