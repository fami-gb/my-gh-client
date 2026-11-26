import type { AuthProvider } from "./auth.ts";

// GitHub REST APIを薄く包む層。ブラウザから api.github.com を直接呼ぶ（CORS対応）。

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft?: boolean;
  body: string | null;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  head: { sha: string; ref: string };
  base: { ref: string };
  requested_reviewers?: GitHubUser[];
  assignees?: GitHubUser[];
}

export interface Deployment {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  created_at: string;
  updated_at: string;
}

export type DeploymentState =
  | "error"
  | "failure"
  | "inactive"
  | "in_progress"
  | "queued"
  | "pending"
  | "success";

export interface DeploymentStatus {
  id: number;
  state: DeploymentState;
  environment_url?: string | null;
  log_url?: string | null;
  target_url?: string | null;
  created_at: string;
}

export interface IssueComment {
  id: number;
  body?: string;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

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

  constructor(opts: GitHubClientOptions) {
    this.auth = opts.auth;
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.baseUrl = opts.baseUrl ?? "https://api.github.com";
    this.maxConcurrent = opts.maxConcurrent ?? 4;
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
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
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
          const body = (await res.json()) as { message?: string };
          if (body.message) message = `${res.status}: ${body.message}`;
        } catch {
          /* 本文がJSONでない */
        }
        if (res.status === 403 && this.rateLimit?.remaining === 0) {
          message = `レート制限に達しました（${this.rateLimit.reset.toLocaleTimeString()} に回復）`;
        }
        throw new GitHubError(res.status, message);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } finally {
      this.release();
    }
  }

  getViewer() {
    return this.request<GitHubUser>("/user");
  }

  listOpenPulls(owner: string, repo: string) {
    return this.request<PullRequest[]>(
      `/repos/${enc(owner)}/${enc(repo)}/pulls?state=open&sort=updated&direction=desc&per_page=30`,
    );
  }

  getPull(owner: string, repo: string, number: number) {
    return this.request<PullRequest>(`/repos/${enc(owner)}/${enc(repo)}/pulls/${number}`);
  }

  listDeployments(owner: string, repo: string, q: { sha?: string; ref?: string; environment?: string }) {
    const params = new URLSearchParams({ per_page: "20" });
    if (q.sha) params.set("sha", q.sha);
    if (q.ref) params.set("ref", q.ref);
    if (q.environment) params.set("environment", q.environment);
    return this.request<Deployment[]>(`/repos/${enc(owner)}/${enc(repo)}/deployments?${params}`);
  }

  listDeploymentStatuses(owner: string, repo: string, deploymentId: number) {
    return this.request<DeploymentStatus[]>(
      `/repos/${enc(owner)}/${enc(repo)}/deployments/${deploymentId}/statuses?per_page=10`,
    );
  }

  /** PRの会話コメント（PRはIssueとしても扱える）。古い順に返る。試作では最初の100件だけを見る。 */
  listIssueComments(owner: string, repo: string, number: number) {
    return this.request<IssueComment[]>(
      `/repos/${enc(owner)}/${enc(repo)}/issues/${number}/comments?per_page=100`,
    );
  }
}

function enc(s: string) {
  return encodeURIComponent(s);
}
