import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CommentIcon } from "@primer/octicons-react";
import type { PrRow } from "../lib/gql.ts";
import { pullHref } from "../lib/routes.ts";
import { repoKey } from "../lib/settings.ts";
import { statusStateTone } from "../lib/status.ts";
import { Link } from "../router.tsx";
import { useServices } from "../services.tsx";
import { Avatar, LabelChip, PrStateIcon, RelTime, ToneIcon } from "./components.tsx";
import { prefetchPull } from "./queries.ts";
import { PreviewButton, usePreviewConfig } from "./PreviewButton.tsx";

const DECISION = {
  APPROVED: { text: "承認済み", cls: "fg-success" },
  CHANGES_REQUESTED: { text: "修正依頼", cls: "fg-danger" },
  REVIEW_REQUIRED: { text: "レビュー待ち", cls: "fg-muted" },
} as const;

export const PullRow = memo(function PullRow({ pr, showRepo = false }: { pr: PrRow; showRepo?: boolean }) {
  const { client, repos } = useServices();
  const qc = useQueryClient();
  const [owner, repo] = pr.repository.nameWithOwner.split("/");
  const config = usePreviewConfig(owner, repo);
  const configured = repos.some((r) => repoKey(r).toLowerCase() === pr.repository.nameWithOwner.toLowerCase());
  const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
  const decision = pr.reviewDecision ? DECISION[pr.reviewDecision] : null;

  return (
    <div className="box-row pr-row">
      <PrStateIcon state={pr.state} isDraft={pr.isDraft} />
      <div className="grow min0">
        <Link
          className="row-link"
          href={pullHref(owner, repo, pr.number)}
          onIntent={() => prefetchPull(qc, client, owner, repo, pr.number)}
        >
          {showRepo && <span className="fg-muted row-repo">{pr.repository.nameWithOwner} </span>}
          <span className="row-title">{pr.title}</span>
        </Link>
        {rollup && (
          <span className="row-check">
            <ToneIcon tone={statusStateTone(rollup)} size={14} />
          </span>
        )}
        {pr.labels.nodes.length > 0 && (
          <span className="row-labels">
            {pr.labels.nodes.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
          </span>
        )}
        <div className="row-meta fg-muted">
          #{pr.number} · <Avatar src={pr.author?.avatarUrl} login={pr.author?.login} size={14} />{" "}
          {pr.author?.login ?? "ghost"} · <RelTime iso={pr.updatedAt} suffix="に更新" />
          {decision && pr.state === "OPEN" && <span className={decision.cls}> · {decision.text}</span>}
        </div>
      </div>
      <div className="row-side">
        {pr.comments.totalCount > 0 && (
          <span className="fg-muted row-comments">
            <CommentIcon size={14} /> {pr.comments.totalCount}
          </span>
        )}
        {configured && pr.state === "OPEN" && (
          <PreviewButton
            compact
            config={config}
            input={{ owner, repo, number: pr.number, headSha: pr.headRefOid, headRef: pr.headRefName }}
          />
        )}
      </div>
    </div>
  );
});
