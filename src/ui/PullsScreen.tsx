import { useEffect, useState, type FormEvent } from "react";
import { GitPullRequestIcon, PlayIcon, SearchIcon, CheckIcon, GitPullRequestClosedIcon, LinkExternalIcon } from "@primer/octicons-react";
import { href, type PullState } from "../lib/routes.ts";
import { navigate } from "../router.tsx";
import { AppHeader, ErrorBox, Skeleton, UnderlineNav } from "./components.tsx";
import { openExternal } from "./open.ts";
import { PullRow } from "./PullRow.tsx";
import { usePullList, useRepoInfo } from "./queries.ts";

export function RepoNav({ owner, repo, active }: { owner: string; repo: string; active: "pulls" | "actions" }) {
  return (
    <UnderlineNav
      active={active}
      items={[
        {
          key: "pulls",
          label: "Pull requests",
          href: href({ name: "pulls", owner, repo, state: "open", q: "" }),
          icon: <GitPullRequestIcon size={16} />,
        },
        { key: "actions", label: "Actions", href: href({ name: "actions", owner, repo }), icon: <PlayIcon size={16} /> },
      ]}
    />
  );
}

export function RepoHeader({ owner, repo }: { owner: string; repo: string }) {
  const info = useRepoInfo(owner, repo);
  return (
    <AppHeader
      context={owner}
      title={
        <>
          {repo}
          {info.data?.isPrivate && <span className="badge-outline">Private</span>}
        </>
      }
      right={
        <button
          className="header-btn"
          aria-label="GitHubで開く"
          onClick={() => openExternal(`https://github.com/${owner}/${repo}`)}
        >
          <LinkExternalIcon size={18} />
        </button>
      }
    />
  );
}

export function PullsScreen({ owner, repo, state, q }: { owner: string; repo: string; state: PullState; q: string }) {
  const list = usePullList(owner, repo, state, q);
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);

  const first = list.data?.pages[0];
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];

  function go(next: { state?: PullState; q?: string }) {
    navigate(href({ name: "pulls", owner, repo, state: next.state ?? state, q: next.q ?? q }), { replace: true });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    go({ q: input.trim() });
  }

  return (
    <>
      <RepoHeader owner={owner} repo={repo} />
      <RepoNav owner={owner} repo={repo} active="pulls" />
      <main className="page">
        <form className="search-bar" onSubmit={submit} role="search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={input}
            placeholder="PRを検索（例: author:me label:bug）"
            onChange={(e) => setInput(e.target.value)}
            enterKeyHint="search"
            autoCapitalize="off"
          />
        </form>
        <div className="box">
          <div className="box-header pulls-filter">
            <button className={`filter-btn ${state === "open" ? "selected" : ""}`} onClick={() => go({ state: "open" })}>
              <GitPullRequestIcon size={16} />
              {first?.openCount !== undefined ? `${first.openCount.toLocaleString()} ` : ""}Open
            </button>
            <button
              className={`filter-btn ${state === "closed" ? "selected" : ""}`}
              onClick={() => go({ state: "closed" })}
            >
              <CheckIcon size={16} />
              {first?.closedCount !== undefined ? `${first.closedCount.toLocaleString()} ` : ""}Closed
            </button>
            {q && (
              <span className="fg-muted small grow text-right">
                {first ? `${first.total.toLocaleString()}件` : ""}{" "}
                <button className="btn-link" onClick={() => go({ q: "" })}>
                  検索を解除
                </button>
              </span>
            )}
          </div>
          {list.isPending ? (
            <Skeleton rows={8} />
          ) : list.isError ? (
            <div className="box-row">
              <ErrorBox error={list.error} retry={() => list.refetch()} />
            </div>
          ) : rows.length === 0 ? (
            <div className="blankslate">
              <GitPullRequestClosedIcon size={24} />
              <p>{q ? "条件に合うPRはありません" : state === "open" ? "オープンなPRはありません" : "PRはありません"}</p>
            </div>
          ) : (
            rows.map((pr) => <PullRow key={pr.id} pr={pr} />)
          )}
        </div>
        {list.hasNextPage && (
          <button className="btn btn-block load-more" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? "読み込み中…" : "さらに読み込む"}
          </button>
        )}
      </main>
    </>
  );
}
