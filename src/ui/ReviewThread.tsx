import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, FileIcon, UnfoldIcon } from "@primer/octicons-react";
import { RESOLVE_THREAD, UNRESOLVE_THREAD, type ReviewThread } from "../lib/gql.ts";
import { tailOfHunk } from "../lib/diff.ts";
import { useServices } from "../services.tsx";
import { Avatar, RelTime } from "./components.tsx";
import { Composer } from "./Composer.tsx";
import { Markdown } from "./Markdown.tsx";
import { refreshPull, useAction } from "./useAction.ts";

/** 行コメントのスレッド。会話タブでは差分の文脈も出す。 */
export function ReviewThreadView({
  thread,
  owner,
  repo,
  number,
  showContext,
}: {
  thread: ReviewThread;
  owner: string;
  repo: string;
  number: number;
  showContext: boolean;
}) {
  const { client } = useServices();
  const qc = useQueryClient();
  const [open, setOpen] = useState(!thread.isResolved);
  const [replying, setReplying] = useState(false);
  const act = useAction();
  const [first] = thread.comments.nodes;
  if (!first) return null;

  async function toggleResolve() {
    await act.run("resolve", async () => {
      await client.graphql(thread.isResolved ? UNRESOLVE_THREAD : RESOLVE_THREAD, { id: thread.id });
      await refreshPull(qc, owner, repo, number);
    });
  }

  return (
    <div className={`thread ${thread.isResolved ? "resolved" : ""}`}>
      {showContext && (
        <button className="thread-header" onClick={() => setOpen(!open)}>
          <FileIcon size={14} />
          <span className="mono thread-path">{thread.path}</span>
          {thread.isOutdated && <span className="badge-outline">Outdated</span>}
          {thread.isResolved && <span className="badge-outline">解決済み</span>}
          {!open && <UnfoldIcon size={14} />}
        </button>
      )}
      {open && (
        <>
          {showContext && (
            <div className="diff mini-diff">
              {tailOfHunk(first.diffHunk).map((l, i) => (
                <div key={i} className={`diff-line diff-${l.kind}`}>
                  <span className="diff-num">{l.oldNo ?? ""}</span>
                  <span className="diff-num">{l.newNo ?? ""}</span>
                  <span className="diff-code">
                    <span className="diff-marker">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
                    {l.text}
                  </span>
                </div>
              ))}
            </div>
          )}
          {thread.comments.nodes.map((c) => (
            <div className="thread-comment" key={c.id}>
              <div className="thread-comment-head">
                <Avatar src={c.author?.avatarUrl} login={c.author?.login} size={20} />
                <strong>{c.author?.login ?? "ghost"}</strong>
                <span className="fg-muted small">
                  <RelTime iso={c.createdAt} />
                </span>
              </div>
              <Markdown html={c.bodyHTML} empty="" />
            </div>
          ))}
          <div className="thread-actions">
            {replying ? (
              <Composer
                draftKey={`reply.${thread.id}`}
                context={`${owner}/${repo}`}
                autoFocus
                rows={2}
                submitLabel="返信"
                onCancel={() => setReplying(false)}
                onSubmit={async (text) => {
                  await client.replyReviewComment(owner, repo, number, first.databaseId, text);
                  setReplying(false);
                  await refreshPull(qc, owner, repo, number);
                }}
              />
            ) : (
              <>
                {thread.viewerCanReply && (
                  <button className="reply-placeholder" onClick={() => setReplying(true)}>
                    返信する…
                  </button>
                )}
                {(thread.isResolved ? thread.viewerCanUnresolve : thread.viewerCanResolve) && (
                  <button className="btn btn-sm" onClick={toggleResolve} disabled={!!act.busy}>
                    <CheckIcon size={14} />
                    {thread.isResolved ? "未解決に戻す" : "解決済みにする"}
                  </button>
                )}
              </>
            )}
            {act.error && <p className="fg-danger small">{act.error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
