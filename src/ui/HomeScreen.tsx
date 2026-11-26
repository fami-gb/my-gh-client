import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  EyeIcon,
  GitPullRequestIcon,
  PlayIcon,
  PlusIcon,
  RepoIcon,
} from "@primer/octicons-react";
import type { PrRow } from "../lib/gql.ts";
import { href } from "../lib/routes.ts";
import { repoKey } from "../lib/settings.ts";
import { Link } from "../router.tsx";
import { useServices } from "../services.tsx";
import { AppHeader, Avatar, ErrorBox, Skeleton } from "./components.tsx";
import { PullRow } from "./PullRow.tsx";
import { pullListQuery, useMyWork, useViewer } from "./queries.ts";

export function HomeScreen() {
  const viewer = useViewer();
  const { repos, client } = useServices();
  const qc = useQueryClient();
  return (
    <>
      <AppHeader
        back={false}
        title="ホーム"
        right={
          viewer.data && (
            <Link href="#/settings" className="header-btn" aria-label="設定">
              <Avatar src={viewer.data.avatar_url} login={viewer.data.login} size={24} />
            </Link>
          )
        }
      />
      <main className="page">
        <MyWork login={viewer.data?.login} />

        <h2 className="section-title">リポジトリ</h2>
        <div className="box">
          {repos.length === 0 && (
            <div className="box-row fg-muted">まだありません。設定から追加してください。</div>
          )}
          {repos.map((r) => (
            <div className="box-row repo-row" key={repoKey(r)}>
              <RepoIcon size={16} className="fg-muted" />
              <Link
                className="grow min0 row-link"
                href={href({ name: "pulls", owner: r.owner, repo: r.repo, state: "open", q: "" })}
                onIntent={() => void qc.prefetchInfiniteQuery(pullListQuery(client, r.owner, r.repo, "open", ""))}
              >
                <span className="fg-muted">{r.owner} / </span>
                <span className="text-bold">{r.repo}</span>
              </Link>
              <Link
                className="btn btn-sm"
                aria-label={`${r.repo} のPR`}
                href={href({ name: "pulls", owner: r.owner, repo: r.repo, state: "open", q: "" })}
              >
                <GitPullRequestIcon size={14} />
              </Link>
              <Link className="btn btn-sm" aria-label={`${r.repo} のActions`} href={href({ name: "actions", owner: r.owner, repo: r.repo })}>
                <PlayIcon size={14} />
              </Link>
            </div>
          ))}
          <Link className="box-row box-row-button fg-accent" href="#/settings">
            <PlusIcon size={16} /> リポジトリを追加・設定
          </Link>
        </div>
      </main>
    </>
  );
}

/** レビュー依頼と自分のPR（GitHubの「My work」） */
export function MyWork({ login }: { login: string | undefined }) {
  const q = useMyWork(login);
  return (
    <>
      <h2 className="section-title">あなたの作業</h2>
      {q.isPending ? (
        <Skeleton rows={3} />
      ) : q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <WorkSection
            title="レビュー依頼"
            icon={<EyeIcon size={16} />}
            rows={q.data.reviewRequested}
            empty="レビュー依頼はありません"
          />
          <WorkSection
            title="自分のPR"
            icon={<GitPullRequestIcon size={16} />}
            rows={q.data.mine}
            empty="オープンなPRはありません"
          />
        </>
      )}
    </>
  );
}

function WorkSection({ title, icon, rows, empty }: { title: string; icon: ReactNode; rows: PrRow[]; empty: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, 5);
  return (
    <div className="box">
      <div className="box-header">
        {icon}
        <span className="text-bold">{title}</span>
        <span className="counter">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="box-row fg-muted small">{empty}</div>
      ) : (
        shown.map((pr) => <PullRow key={pr.id} pr={pr} showRepo />)
      )}
      {rows.length > 5 && (
        <button className="box-row box-row-button fg-accent small" onClick={() => setExpanded(!expanded)}>
          {expanded ? "たたむ" : `ほか ${rows.length - 5} 件`} <ChevronRightIcon size={14} />
        </button>
      )}
    </div>
  );
}
