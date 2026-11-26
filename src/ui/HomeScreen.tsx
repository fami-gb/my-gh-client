import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GitHubUser, PullRequest } from "../lib/github.ts";
import { pullHref } from "../lib/routes.ts";
import { repoKey, type RepoConfig } from "../lib/settings.ts";
import { useServices } from "../services.tsx";
import { PreviewButton } from "./PreviewButton.tsx";
import { relativeTime } from "./time.ts";

const TAB_KEY = "home.tab";

export function HomeScreen({ viewer }: { viewer: GitHubUser }) {
  const { repos } = useServices();
  const [tab, setTab] = useState(() => localStorage.getItem(TAB_KEY) ?? "");
  const current = repos.find((r) => repoKey(r) === tab) ?? repos[0];
  const [onlyMine, setOnlyMine] = useState(false);

  function select(r: RepoConfig) {
    localStorage.setItem(TAB_KEY, repoKey(r));
    setTab(repoKey(r));
  }

  return (
    <main className="page">
      <header className="topbar">
        <h1>プルリクエスト</h1>
        <a className="icon-btn" href="#/settings" aria-label="設定">
          ⚙
        </a>
      </header>
      {repos.length === 0 ? (
        <p className="center muted">
          リポジトリがありません。<a href="#/settings">設定</a>から追加してください。
        </p>
      ) : (
        <>
          <nav className="tabs">
            {repos.map((r) => (
              <button
                key={repoKey(r)}
                className={`tab ${r === current ? "active" : ""}`}
                onClick={() => select(r)}
              >
                {r.repo}
              </button>
            ))}
          </nav>
          <label className="toggle small">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            自分に関係するものだけ
          </label>
          <PullList key={repoKey(current)} config={current} viewer={viewer} onlyMine={onlyMine} />
        </>
      )}
    </main>
  );
}

export function isRelated(pr: PullRequest, login: string) {
  return (
    pr.user?.login === login ||
    !!pr.assignees?.some((u) => u.login === login) ||
    !!pr.requested_reviewers?.some((u) => u.login === login)
  );
}

function PullList({ config, viewer, onlyMine }: { config: RepoConfig; viewer: GitHubUser; onlyMine: boolean }) {
  const { client } = useServices();
  const q = useQuery({
    queryKey: ["pulls", config.owner, config.repo],
    queryFn: () => client.listOpenPulls(config.owner, config.repo),
  });

  if (q.isPending) return <p className="center muted">読み込み中…</p>;
  if (q.isError) {
    return (
      <div className="center">
        <p className="error">{q.error.message}</p>
        <button className="btn" onClick={() => q.refetch()}>
          再試行
        </button>
      </div>
    );
  }
  const pulls = onlyMine ? q.data.filter((p) => isRelated(p, viewer.login)) : q.data;
  if (pulls.length === 0) return <p className="center muted">オープンなPRはありません</p>;

  return (
    <ul className="list">
      {pulls.map((pr) => (
        <li key={pr.number} className="row">
          <a className="row-main" href={pullHref(config.owner, config.repo, pr.number)}>
            <span className="title">
              {pr.draft && <span className="badge">Draft</span>}
              {pr.title}
            </span>
            <span className="muted small">
              #{pr.number} · {pr.user?.login ?? "?"} · {relativeTime(pr.updated_at)}更新
              {isRelated(pr, viewer.login) && <span className="badge mine">自分</span>}
            </span>
          </a>
          <PreviewButton
            config={config.preview}
            input={{
              owner: config.owner,
              repo: config.repo,
              number: pr.number,
              headSha: pr.head.sha,
              headRef: pr.head.ref,
            }}
          />
        </li>
      ))}
    </ul>
  );
}
