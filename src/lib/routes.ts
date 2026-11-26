// ハッシュルーター（解析と組み立て）。パスは github.com と同じ形にしてあるので、
// GitHubのURLは「https://github.com」を「#」に置き換えるだけでアプリ内の画面になる。
//
// #/                                   ホーム
// #/notifications                      通知
// #/settings                           設定
// #/:owner/:repo                       リポジトリ（PR一覧）
// #/:owner/:repo/pulls?q=…&state=…     PR一覧
// #/:owner/:repo/pull/:n[/commits|/checks|/files]   PR
// #/:owner/:repo/issues/:n             Issue
// #/:owner/:repo/actions[?workflow=id] Actions
// #/:owner/:repo/actions/runs/:id      ワークフロー実行
// #/:owner/:repo/actions/runs/:id/job/:jobId   ジョブとログ

export type PullTab = "conversation" | "commits" | "checks" | "files";
export type PullState = "open" | "closed" | "all";

export type Route =
  | { name: "home" }
  | { name: "notifications"; all?: boolean }
  | { name: "settings" }
  | { name: "pulls"; owner: string; repo: string; state: PullState; q: string }
  | { name: "pull"; owner: string; repo: string; number: number; tab: PullTab }
  | { name: "issue"; owner: string; repo: string; number: number }
  | { name: "actions"; owner: string; repo: string; workflow?: number }
  | { name: "run"; owner: string; repo: string; runId: number }
  | { name: "job"; owner: string; repo: string; runId: number; jobId: number }
  | { name: "notfound"; path: string };

const PULL_TABS: Record<string, PullTab> = { "": "conversation", commits: "commits", checks: "checks", files: "files" };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?", 2);
  const path = pathPart.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(queryPart);
  if (path === "/") return { name: "home" };
  if (path === "/notifications") return query.get("all") === "1" ? { name: "notifications", all: true } : { name: "notifications" };
  if (path === "/settings") return { name: "settings" };

  let segs: string[];
  try {
    segs = path.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return { name: "notfound", path };
  }
  const [owner, repo, kind, id, sub, subId] = segs;
  if (!owner || !repo) return { name: "notfound", path };
  const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : NaN);

  if (kind === undefined || kind === "pulls") {
    const state = query.get("state");
    return {
      name: "pulls",
      owner,
      repo,
      state: state === "closed" || state === "all" ? state : "open",
      q: query.get("q") ?? "",
    };
  }
  if (kind === "pull" && num(id) > 0 && (sub ?? "") in PULL_TABS && subId === undefined) {
    return { name: "pull", owner, repo, number: num(id), tab: PULL_TABS[sub ?? ""] };
  }
  if (kind === "issues" && num(id) > 0 && sub === undefined) {
    return { name: "issue", owner, repo, number: num(id) };
  }
  if (kind === "actions") {
    if (id === undefined) {
      const wf = num(query.get("workflow") ?? undefined);
      return { name: "actions", owner, repo, ...(wf > 0 ? { workflow: wf } : {}) };
    }
    if (id === "runs" && num(sub) > 0) {
      const jobIdx = segs.indexOf("job", 5);
      if (segs.length === 5) return { name: "run", owner, repo, runId: num(sub) };
      // GitHubのURLは /actions/runs/:id/job/:jobId または /actions/runs/:id/attempts/:n/job/:jobId
      if (jobIdx > 0 && num(segs[jobIdx + 1]) > 0 && segs.length === jobIdx + 2) {
        return { name: "job", owner, repo, runId: num(sub), jobId: num(segs[jobIdx + 1]) };
      }
      if (subId === "attempts") return { name: "run", owner, repo, runId: num(sub) };
    }
  }
  return { name: "notfound", path };
}

const e = encodeURIComponent;

export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "notifications":
      return route.all ? "#/notifications?all=1" : "#/notifications";
    case "settings":
      return "#/settings";
    case "pulls": {
      const p = new URLSearchParams();
      if (route.state !== "open") p.set("state", route.state);
      if (route.q) p.set("q", route.q);
      const qs = p.toString();
      return `#/${e(route.owner)}/${e(route.repo)}/pulls${qs ? "?" + qs : ""}`;
    }
    case "pull":
      return `#/${e(route.owner)}/${e(route.repo)}/pull/${route.number}${route.tab === "conversation" ? "" : "/" + route.tab}`;
    case "issue":
      return `#/${e(route.owner)}/${e(route.repo)}/issues/${route.number}`;
    case "actions":
      return `#/${e(route.owner)}/${e(route.repo)}/actions${route.workflow ? `?workflow=${route.workflow}` : ""}`;
    case "run":
      return `#/${e(route.owner)}/${e(route.repo)}/actions/runs/${route.runId}`;
    case "job":
      return `#/${e(route.owner)}/${e(route.repo)}/actions/runs/${route.runId}/job/${route.jobId}`;
    case "notfound":
      return "#" + route.path;
  }
}

export function pullHref(owner: string, repo: string, number: number, tab: PullTab = "conversation") {
  return href({ name: "pull", owner, repo, number, tab });
}

export function pullsHref(owner: string, repo: string) {
  return href({ name: "pulls", owner, repo, state: "open", q: "" });
}

/** github.com のURLをアプリ内のリンクにする。対応していない画面なら null。 */
export function githubUrlToHref(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || (u.hostname !== "github.com" && u.hostname !== "www.github.com")) return null;
  const route = parseHash("#" + u.pathname + u.search);
  if (route.name === "notfound" || route.name === "home" || route.name === "settings") return null;
  return href(route);
}

/** 通知などに入っている api.github.com のURLをアプリ内のリンクにする */
export function apiUrlToHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)$/);
  if (!m) return null;
  const [, owner, repo, kind, n] = m;
  return kind === "pulls"
    ? pullHref(decodeURIComponent(owner), decodeURIComponent(repo), Number(n))
    : href({ name: "issue", owner: decodeURIComponent(owner), repo: decodeURIComponent(repo), number: Number(n) });
}

/** 画面の親（戻るボタンで履歴が無いときの行き先） */
export function parentOf(route: Route): string | null {
  switch (route.name) {
    case "home":
      return null;
    case "notifications":
    case "settings":
    case "notfound":
      return "#/";
    case "pulls":
    case "actions":
      return "#/";
    case "pull":
    case "issue":
      return pullsHref(route.owner, route.repo);
    case "run":
      return href({ name: "actions", owner: route.owner, repo: route.repo });
    case "job":
      return href({ name: "run", owner: route.owner, repo: route.repo, runId: route.runId });
  }
}
