import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import {
  ISSUE_DETAIL,
  MY_WORK,
  PULL_COMMITS,
  PULL_DETAIL,
  PULL_LIST,
  PULL_SEARCH,
  REPO_INFO,
  type IssueDetail,
  type MyWorkResult,
  type PrRow,
  type PullCommitsResult,
  type PullDetailResult,
  type PullListResult,
  type RepoInfo,
  type SearchResult,
} from "../lib/gql.ts";
import { GitHubError, type GitHubClient } from "../lib/github.ts";
import type { PullState } from "../lib/routes.ts";
import { useServices } from "../services.tsx";

// 画面ごとのデータ取得。キーをそろえておくと、一覧で取ったデータを詳細で使い回せる。

export const keys = {
  viewer: ["viewer"] as const,
  myWork: ["mywork"] as const,
  repo: (o: string, r: string) => ["repo", o, r] as const,
  pulls: (o: string, r: string, state: PullState, q: string) => ["pulls", o, r, state, q] as const,
  pull: (o: string, r: string, n: number) => ["pull", o, r, n] as const,
  pullFiles: (o: string, r: string, n: number, sha: string) => ["pullFiles", o, r, n, sha] as const,
  pullCommits: (o: string, r: string, n: number) => ["pullCommits", o, r, n] as const,
  issue: (o: string, r: string, n: number) => ["issue", o, r, n] as const,
  workflows: (o: string, r: string) => ["workflows", o, r] as const,
  runs: (o: string, r: string, wf: number | undefined) => ["runs", o, r, wf ?? 0] as const,
  run: (o: string, r: string, id: number) => ["run", o, r, id] as const,
  jobs: (o: string, r: string, id: number) => ["jobs", o, r, id] as const,
  job: (o: string, r: string, id: number) => ["job", o, r, id] as const,
  jobLog: (o: string, r: string, id: number) => ["jobLog", o, r, id] as const,
  notifications: (all: boolean) => ["notifications", all] as const,
};

export function useViewer() {
  const { client } = useServices();
  return useQuery({ queryKey: keys.viewer, queryFn: () => client.getViewer(), staleTime: 10 * 60_000 });
}

export function useViewerLogin() {
  return useViewer().data?.login;
}

function isPr(n: unknown): n is PrRow {
  return !!n && typeof (n as PrRow).number === "number" && "headRefOid" in (n as object);
}

export function useRepoInfo(owner: string, repo: string) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.repo(owner, repo),
    queryFn: async () => {
      const d = await client.graphql<{ repository: RepoInfo | null }>(REPO_INFO, { owner, name: repo });
      if (!d.repository) throw new GitHubError(404, "リポジトリが見つかりません");
      return d.repository;
    },
    staleTime: 30 * 60_000,
  });
}

export function useMyWork(login: string | undefined) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.myWork,
    enabled: !!login,
    queryFn: async () => {
      const d = await client.graphql<MyWorkResult>(MY_WORK, {
        review: "is:open is:pr archived:false review-requested:@me sort:updated-desc",
        mine: "is:open is:pr archived:false author:@me sort:updated-desc",
      });
      return { reviewRequested: d.reviewRequested.nodes.filter(isPr), mine: d.mine.nodes.filter(isPr) };
    },
  });
}

export interface PullPage {
  rows: PrRow[];
  total: number;
  openCount?: number;
  closedCount?: number;
  next: string | null;
}

export function pullListQuery(client: GitHubClient, owner: string, repo: string, state: PullState, q: string) {
  return {
    queryKey: keys.pulls(owner, repo, state, q),
    initialPageParam: null as string | null,
    getNextPageParam: (last: PullPage) => last.next,
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<PullPage> => {
      if (q.trim()) {
        const stateQ = state === "open" ? "is:open" : state === "closed" ? "is:closed" : "";
        const d = await client.graphql<SearchResult>(PULL_SEARCH, {
          q: `repo:${owner}/${repo} is:pr ${stateQ} ${q.trim()} sort:updated-desc`,
          after: pageParam,
        });
        return {
          rows: d.search.nodes.filter(isPr),
          total: d.search.issueCount,
          next: d.search.pageInfo.hasNextPage ? d.search.pageInfo.endCursor : null,
        };
      }
      const states = state === "open" ? ["OPEN"] : state === "closed" ? ["CLOSED", "MERGED"] : null;
      const d = await client.graphql<PullListResult>(PULL_LIST, { owner, name: repo, states, after: pageParam });
      if (!d.repository) throw new GitHubError(404, "リポジトリが見つかりません（トークンの対象外かもしれません）");
      const p = d.repository.pullRequests;
      return {
        rows: p.nodes,
        total: p.totalCount,
        openCount: d.repository.open.totalCount,
        closedCount: d.repository.closed.totalCount,
        next: p.pageInfo.hasNextPage ? p.pageInfo.endCursor : null,
      };
    },
  };
}

export function usePullList(owner: string, repo: string, state: PullState, q: string) {
  const { client } = useServices();
  return useInfiniteQuery(pullListQuery(client, owner, repo, state, q));
}

export function pullDetailQuery(client: GitHubClient, owner: string, repo: string, number: number) {
  return {
    queryKey: keys.pull(owner, repo, number),
    queryFn: async () => {
      const d = await client.graphql<PullDetailResult>(PULL_DETAIL, { owner, name: repo, number });
      const pr = d.repository?.pullRequest;
      if (!pr) throw new GitHubError(404, `#${number} は見つかりません`);
      return pr;
    },
    staleTime: 20_000,
  };
}

export function usePullDetail(owner: string, repo: string, number: number) {
  const { client } = useServices();
  return useQuery({
    ...pullDetailQuery(client, owner, repo, number),
    // チェック実行中は自動で更新する
    refetchInterval: (q) => {
      const state = q.state.data?.lastCommit.nodes[0]?.commit.statusCheckRollup?.state;
      return state === "PENDING" || q.state.data?.mergeable === "UNKNOWN" ? 15_000 : false;
    },
  });
}

export function prefetchPull(qc: QueryClient, client: GitHubClient, owner: string, repo: string, number: number) {
  void qc.prefetchQuery(pullDetailQuery(client, owner, repo, number));
}

/** 一覧ですでに取ってある行（詳細を取り終えるまでの仮表示に使う） */
export function findPrRow(qc: QueryClient, owner: string, repo: string, number: number): PrRow | undefined {
  const name = `${owner}/${repo}`.toLowerCase();
  for (const [, data] of qc.getQueriesData<unknown>({ predicate: (q) => q.queryKey[0] === "pulls" || q.queryKey[0] === "mywork" })) {
    const rows: PrRow[] = [];
    if (data && typeof data === "object" && "pages" in data) {
      for (const p of (data as { pages: PullPage[] }).pages) rows.push(...p.rows);
    } else if (data && typeof data === "object" && "mine" in data) {
      const w = data as { mine: PrRow[]; reviewRequested: PrRow[] };
      rows.push(...w.mine, ...w.reviewRequested);
    }
    const hit = rows.find((r) => r.number === number && r.repository.nameWithOwner.toLowerCase() === name);
    if (hit) return hit;
  }
  return undefined;
}

export function usePullFiles(owner: string, repo: string, number: number, headSha: string | undefined) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.pullFiles(owner, repo, number, headSha ?? ""),
    enabled: !!headSha,
    queryFn: () => client.listPullFiles(owner, repo, number),
    staleTime: 5 * 60_000,
  });
}

export function usePullCommits(owner: string, repo: string, number: number) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.pullCommits(owner, repo, number),
    queryFn: async () => {
      const d = await client.graphql<PullCommitsResult>(PULL_COMMITS, { owner, name: repo, number });
      return d.repository?.pullRequest?.commits ?? { totalCount: 0, nodes: [] };
    },
  });
}

export function useIssue(owner: string, repo: string, number: number) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.issue(owner, repo, number),
    queryFn: async () => {
      const d = await client.graphql<{ repository: { issue: IssueDetail | null } | null }>(ISSUE_DETAIL, {
        owner,
        name: repo,
        number,
      });
      const issue = d.repository?.issue;
      if (!issue) throw new GitHubError(404, `#${number} は見つかりません`);
      return issue;
    },
  });
}

// ---- Actions ----

export function useWorkflows(owner: string, repo: string) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.workflows(owner, repo),
    queryFn: async () => (await client.listWorkflows(owner, repo)).workflows,
    staleTime: 30 * 60_000,
  });
}

export function useRuns(owner: string, repo: string, workflowId?: number) {
  const { client } = useServices();
  return useInfiniteQuery({
    queryKey: keys.runs(owner, repo, workflowId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => client.listRuns(owner, repo, { workflowId, page: pageParam }),
    getNextPageParam: (last, pages) =>
      pages.length * 30 < last.total_count && last.workflow_runs.length === 30 ? pages.length + 1 : undefined,
    refetchInterval: (q) =>
      q.state.data?.pages[0]?.workflow_runs.some((r) => r.status !== "completed") ? 10_000 : false,
  });
}

export function runQuery(client: GitHubClient, owner: string, repo: string, runId: number) {
  return { queryKey: keys.run(owner, repo, runId), queryFn: () => client.getRun(owner, repo, runId) };
}

export function useRun(owner: string, repo: string, runId: number) {
  const { client } = useServices();
  return useQuery({
    ...runQuery(client, owner, repo, runId),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "completed" ? 5_000 : false),
  });
}

export function jobsQuery(client: GitHubClient, owner: string, repo: string, runId: number) {
  return {
    queryKey: keys.jobs(owner, repo, runId),
    queryFn: async () => (await client.listJobs(owner, repo, runId)).jobs,
  };
}

export function useJobs(owner: string, repo: string, runId: number, running: boolean) {
  const { client } = useServices();
  return useQuery({ ...jobsQuery(client, owner, repo, runId), refetchInterval: running ? 5_000 : false });
}

export function useJob(owner: string, repo: string, jobId: number) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.job(owner, repo, jobId),
    queryFn: () => client.getJob(owner, repo, jobId),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "completed" ? 5_000 : false),
  });
}

export function useJobLog(owner: string, repo: string, jobId: number, running: boolean) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.jobLog(owner, repo, jobId),
    queryFn: () => client.getJobLog(owner, repo, jobId),
    refetchInterval: running ? 10_000 : false,
    staleTime: running ? 0 : Infinity,
    retry: 1,
  });
}

// ---- 通知 ----

export function useNotifications(all: boolean) {
  const { client } = useServices();
  return useQuery({
    queryKey: keys.notifications(all),
    queryFn: () => client.listNotifications({ all }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    // Fine-grained PAT では使えない（403）。繰り返さない
    retry: (count, err) => !(err instanceof GitHubError && (err.status === 403 || err.status === 401)) && count < 2,
  });
}
