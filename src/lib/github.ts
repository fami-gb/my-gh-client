import type { AuthProvider } from "./auth.ts";
import type {
  CheckRun,
  CombinedStatus,
  Deployment,
  DeploymentStatus,
  GitHubUser,
  IssueComment,
  Job,
  MergeMethod,
  Notification,
  PullFile,
  PullRequest,
  ReviewEvent,
  Workflow,
  WorkflowRun,
} from "./types.ts";

export type * from "./types.ts";

// GitHub APIを薄く包む層。ブラウザから api.github.com を直接呼ぶ（CORS対応）。
// 一覧や詳細の表示はGraphQL（1往復でまとめて取れる）、書き込みと差分・ログはRESTを使う。

export interface RateLimit {
  limit: number;
  remaining: number;
  reset: Date;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

/** トークンが無い・無効。ログイン画面へ戻す合図。 */
export class AuthRequiredError extends GitHubError {
  constructor(message = "ログインが必要です") {
    super(401, message);
    this.name = "AuthRequiredError";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
  auth: AuthProvider;
  fetch?: FetchLike;
  baseUrl?: string;
  /** 同時に投げるリクエスト数の上限（二次レート制限対策） */
  maxConcurrent?: number;
}

export class GitHubClient {
  private auth: AuthProvider;
  private fetchImpl: FetchLike;
  private baseUrl: string;
  private maxConcurrent: number;
  private active = 0;
  private waiting: (() => void)[] = [];
  rateLimit: RateLimit | null = null;
  /** PATの期限（GitHubが応答ヘッダーで返す場合のみ） */
  tokenExpiration: string | null = null;
  /** クラシックPATのスコープ（X-OAuth-Scopes）。Fine-grained では null */
  scopes: string[] | null = null;

  constructor(opts: GitHubClientOptions) {
    this.auth = opts.auth;
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.baseUrl = opts.baseUrl ?? "https://api.github.com";
    this.maxConcurrent = opts.maxConcurrent ?? 6;
  }

  private async acquire() {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  private async send(path: string, token: string, init?: RequestInit) {
    const url = path.startsWith("https://") ? path : this.baseUrl + path;
    if (!url.startsWith(this.baseUrl + "/")) throw new Error(`想定外の送信先です: ${url}`);
    return this.fetchImpl(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  }

  private readHeaders(res: Response) {
    const limit = res.headers.get("x-ratelimit-limit");
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (limit && remaining && reset) {
      this.rateLimit = { limit: +limit, remaining: +remaining, reset: new Date(+reset * 1000) };
    }
    const exp = res.headers.get("github-authentication-token-expiration");
    if (exp) this.tokenExpiration = exp;
    const scopes = res.headers.get("x-oauth-scopes");
    if (scopes !== null) this.scopes = scopes.split(",").map((s) => s.trim()).filter(Boolean);
  }

  /** エラー処理まで済ませた Response を返す。本文の読み方は呼び出し側が決める。 */
  private async raw(path: string, init?: RequestInit): Promise<Response> {
    await this.acquire();
    try {
      let token = await this.auth.getToken();
      if (!token) throw new AuthRequiredError();
      let res = await this.send(path, token, init);
      if (res.status === 401) {
        // 将来のOAuthではここで更新済みのトークンが返る。PATでは同じものが返る。
        const retry = await this.auth.getToken();
        if (!retry) throw new AuthRequiredError();
        if (retry !== token) {
          token = retry;
          res = await this.send(path, token, init);
        }
      }
      this.readHeaders(res);
      if (res.status === 401) throw new AuthRequiredError("トークンが無効か期限切れです");
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try {
          const body = (await res.json()) as { message?: string; errors?: { message?: string }[] };
          if (body.message) message = `${res.status}: ${body.message}`;
          const detail = body.errors?.map((e) => e.message).filter(Boolean).join(" / ");
          if (detail) message += `（${detail}）`;
        } catch {
          /* 本文がJSONでない */
        }
        if ((res.status === 403 || res.status === 429) && this.rateLimit?.remaining === 0) {
          message = `レート制限に達しました（${this.rateLimit.reset.toLocaleTimeString()} に回復）`;
        }
        throw new GitHubError(res.status, message);
      }
      return res;
    } finally {
      this.release();
    }
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.raw(path, init);
    if (res.status === 204 || res.status === 202 || res.headers.get("content-length") === "0") {
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
    return (await res.json()) as T;
  }

  async requestText(path: string, init?: RequestInit): Promise<string> {
    const res = await this.raw(path, init);
    return res.text();
  }

  private json<T>(method: string, path: string, body?: unknown) {
    return this.request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.json<{ data?: T; errors?: { message: string; type?: string }[] }>("POST", "/graphql", {
      query,
      variables,
    });
    if (res.errors?.length) {
      // 権限の無い一部のフィールドだけが null になる場合は、data があれば使う
      const fatal = !res.data || res.errors.some((e) => e.type !== "FORBIDDEN" && e.type !== "NOT_FOUND");
      if (fatal) {
        const notFound = res.errors.find((e) => e.type === "NOT_FOUND");
        throw new GitHubError(notFound ? 404 : 400, res.errors.map((e) => e.message).join(" / "));
      }
    }
    return res.data as T;
  }

  // ---- ユーザー ----

  getViewer() {
    return this.request<GitHubUser>("/user");
  }

  // ---- PR（REST） ----

  listOpenPulls(owner: string, repo: string) {
    return this.request<PullRequest[]>(
      `${repoPath(owner, repo)}/pulls?state=open&sort=updated&direction=desc&per_page=30`,
    );
  }

  getPull(owner: string, repo: string, number: number) {
    return this.request<PullRequest>(`${repoPath(owner, repo)}/pulls/${number}`);
  }

  /** 変更ファイル（最大3000件、100件ずつ） */
  async listPullFiles(owner: string, repo: string, number: number) {
    const all: PullFile[] = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await this.request<PullFile[]>(
        `${repoPath(owner, repo)}/pulls/${number}/files?per_page=100&page=${page}`,
      );
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  updatePull(owner: string, repo: string, number: number, patch: { state?: "open" | "closed"; title?: string; body?: string }) {
    return this.json<PullRequest>("PATCH", `${repoPath(owner, repo)}/pulls/${number}`, patch);
  }

  mergePull(owner: string, repo: string, number: number, opts: { method: MergeMethod; sha: string; title?: string; message?: string }) {
    return this.json<{ merged: boolean; message: string; sha: string }>(
      "PUT",
      `${repoPath(owner, repo)}/pulls/${number}/merge`,
      { merge_method: opts.method, sha: opts.sha, commit_title: opts.title, commit_message: opts.message },
    );
  }

  updatePullBranch(owner: string, repo: string, number: number, expectedHeadSha: string) {
    return this.json<{ message: string }>("PUT", `${repoPath(owner, repo)}/pulls/${number}/update-branch`, {
      expected_head_sha: expectedHeadSha,
    });
  }

  deleteBranch(owner: string, repo: string, branch: string) {
    return this.request<void>(`${repoPath(owner, repo)}/git/refs/heads/${branch.split("/").map(enc).join("/")}`, {
      method: "DELETE",
    });
  }

  /** レビューを出す。comments を付けると行コメントもまとめて送る。 */
  createReview(
    owner: string,
    repo: string,
    number: number,
    review: {
      commitId: string;
      event: ReviewEvent;
      body?: string;
      comments?: { path: string; line: number; side: "LEFT" | "RIGHT"; body: string }[];
    },
  ) {
    return this.json<{ id: number }>("POST", `${repoPath(owner, repo)}/pulls/${number}/reviews`, {
      commit_id: review.commitId,
      event: review.event,
      body: review.body || undefined,
      comments: review.comments?.length ? review.comments : undefined,
    });
  }

  /** 行コメントを1件だけすぐに付ける */
  createReviewComment(
    owner: string,
    repo: string,
    number: number,
    c: { commitId: string; path: string; line: number; side: "LEFT" | "RIGHT"; body: string },
  ) {
    return this.json<{ id: number }>("POST", `${repoPath(owner, repo)}/pulls/${number}/comments`, {
      commit_id: c.commitId,
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
    });
  }

  replyReviewComment(owner: string, repo: string, number: number, commentId: number, body: string) {
    return this.json<{ id: number }>("POST", `${repoPath(owner, repo)}/pulls/${number}/comments/${commentId}/replies`, {
      body,
    });
  }

  requestReviewers(owner: string, repo: string, number: number, reviewers: string[]) {
    return this.json<unknown>("POST", `${repoPath(owner, repo)}/pulls/${number}/requested_reviewers`, { reviewers });
  }

  // ---- Issue / 会話コメント ----

  /** PRの会話コメント（PRはIssueとしても扱える）。古い順に返る。最初の100件だけを見る。 */
  listIssueComments(owner: string, repo: string, number: number) {
    return this.request<IssueComment[]>(`${repoPath(owner, repo)}/issues/${number}/comments?per_page=100`);
  }

  createIssueComment(owner: string, repo: string, number: number, body: string) {
    return this.json<IssueComment>("POST", `${repoPath(owner, repo)}/issues/${number}/comments`, { body });
  }

  updateIssueComment(owner: string, repo: string, commentId: number, body: string) {
    return this.json<IssueComment>("PATCH", `${repoPath(owner, repo)}/issues/comments/${commentId}`, { body });
  }

  deleteIssueComment(owner: string, repo: string, commentId: number) {
    return this.request<void>(`${repoPath(owner, repo)}/issues/comments/${commentId}`, { method: "DELETE" });
  }

  updateIssue(owner: string, repo: string, number: number, patch: { state?: "open" | "closed"; state_reason?: string }) {
    return this.json<unknown>("PATCH", `${repoPath(owner, repo)}/issues/${number}`, patch);
  }

  /** GitHub風のMarkdownをHTMLにする（プレビュー用） */
  renderMarkdown(text: string, context?: string) {
    return this.requestText("/markdown", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/html" },
      body: JSON.stringify({ text, mode: "gfm", context }),
    });
  }

  // ---- Deployments（プレビュー探し） ----

  listDeployments(owner: string, repo: string, q: { sha?: string; ref?: string; environment?: string }) {
    const params = new URLSearchParams({ per_page: "20" });
    if (q.sha) params.set("sha", q.sha);
    if (q.ref) params.set("ref", q.ref);
    if (q.environment) params.set("environment", q.environment);
    return this.request<Deployment[]>(`${repoPath(owner, repo)}/deployments?${params}`);
  }

  listDeploymentStatuses(owner: string, repo: string, deploymentId: number) {
    return this.request<DeploymentStatus[]>(
      `${repoPath(owner, repo)}/deployments/${deploymentId}/statuses?per_page=10`,
    );
  }

  // ---- チェック ----

  listCheckRuns(owner: string, repo: string, ref: string) {
    return this.request<{ total_count: number; check_runs: CheckRun[] }>(
      `${repoPath(owner, repo)}/commits/${enc(ref)}/check-runs?per_page=100&filter=latest`,
    );
  }

  getCombinedStatus(owner: string, repo: string, ref: string) {
    return this.request<CombinedStatus>(`${repoPath(owner, repo)}/commits/${enc(ref)}/status?per_page=100`);
  }

  // ---- Actions ----

  listWorkflows(owner: string, repo: string) {
    return this.request<{ total_count: number; workflows: Workflow[] }>(
      `${repoPath(owner, repo)}/actions/workflows?per_page=100`,
    );
  }

  listRuns(
    owner: string,
    repo: string,
    q: { workflowId?: number; branch?: string; status?: string; event?: string; page?: number } = {},
  ) {
    const params = new URLSearchParams({ per_page: "30", page: String(q.page ?? 1) });
    if (q.branch) params.set("branch", q.branch);
    if (q.status) params.set("status", q.status);
    if (q.event) params.set("event", q.event);
    const base = q.workflowId
      ? `${repoPath(owner, repo)}/actions/workflows/${q.workflowId}/runs`
      : `${repoPath(owner, repo)}/actions/runs`;
    return this.request<{ total_count: number; workflow_runs: WorkflowRun[] }>(`${base}?${params}`);
  }

  getRun(owner: string, repo: string, runId: number) {
    return this.request<WorkflowRun>(`${repoPath(owner, repo)}/actions/runs/${runId}`);
  }

  listJobs(owner: string, repo: string, runId: number, attempt?: number) {
    const path = attempt
      ? `${repoPath(owner, repo)}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`
      : `${repoPath(owner, repo)}/actions/runs/${runId}/jobs?per_page=100&filter=latest`;
    return this.request<{ total_count: number; jobs: Job[] }>(path);
  }

  getJob(owner: string, repo: string, jobId: number) {
    return this.request<Job>(`${repoPath(owner, repo)}/actions/jobs/${jobId}`);
  }

  /** ジョブのログ（テキスト）。GitHubは一時URLへリダイレクトする。 */
  getJobLog(owner: string, repo: string, jobId: number) {
    return this.requestText(`${repoPath(owner, repo)}/actions/jobs/${jobId}/logs`);
  }

  rerunRun(owner: string, repo: string, runId: number) {
    return this.json<void>("POST", `${repoPath(owner, repo)}/actions/runs/${runId}/rerun`, {});
  }

  rerunFailedJobs(owner: string, repo: string, runId: number) {
    return this.json<void>("POST", `${repoPath(owner, repo)}/actions/runs/${runId}/rerun-failed-jobs`, {});
  }

  rerunJob(owner: string, repo: string, jobId: number) {
    return this.json<void>("POST", `${repoPath(owner, repo)}/actions/jobs/${jobId}/rerun`, {});
  }

  cancelRun(owner: string, repo: string, runId: number) {
    return this.json<void>("POST", `${repoPath(owner, repo)}/actions/runs/${runId}/cancel`);
  }

  dispatchWorkflow(owner: string, repo: string, workflowId: number, ref: string, inputs: Record<string, string> = {}) {
    return this.json<void>("POST", `${repoPath(owner, repo)}/actions/workflows/${workflowId}/dispatches`, {
      ref,
      inputs,
    });
  }

  // ---- 通知（クラシックPATのみ。Fine-grained PATでは403になる） ----

  listNotifications(opts: { all?: boolean; participating?: boolean } = {}) {
    const params = new URLSearchParams({ per_page: "50" });
    if (opts.all) params.set("all", "true");
    if (opts.participating) params.set("participating", "true");
    return this.request<Notification[]>(`/notifications?${params}`, { cache: "no-store" });
  }

  markNotificationRead(threadId: string) {
    return this.request<void>(`/notifications/threads/${enc(threadId)}`, { method: "PATCH" });
  }

  markNotificationDone(threadId: string) {
    return this.request<void>(`/notifications/threads/${enc(threadId)}`, { method: "DELETE" });
  }

  markAllNotificationsRead() {
    return this.json<unknown>("PUT", "/notifications", { read: true });
  }
}

export function repoPath(owner: string, repo: string) {
  return `/repos/${enc(owner)}/${enc(repo)}`;
}

function enc(s: string) {
  return encodeURIComponent(s);
}
