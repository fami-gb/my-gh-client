// リポジトリごとの設定。トークン以外の設定なので localStorage に置く。

export type PreviewStrategy = "auto" | "deployments" | "comments";

export interface PreviewConfig {
  /** auto: Deployments → だめならボットコメント */
  strategy: PreviewStrategy;
  /** Deploymentsの環境名を絞る正規表現（空なら全部）。例: "preview|pr-" */
  environmentPattern: string;
  /** プレビューURLを書き込むボットのログイン名 */
  botLogins: string[];
  /** コメント本文からURLを抜く正規表現 */
  urlPattern: string;
  /** ボタンにしてよいドメイン（サブドメインも可） */
  allowedDomains: string[];
}

export interface RepoConfig {
  owner: string;
  repo: string;
  preview: PreviewConfig;
}

// 推測: Cloudflare Pagesのボット名は未確認。実際のPRで確かめて設定画面で直す。
export const DEFAULT_PREVIEW: PreviewConfig = {
  strategy: "auto",
  environmentPattern: "",
  botLogins: ["cloudflare-workers-and-pages[bot]"],
  urlPattern: String.raw`https://[^\s<>()"'\]\[|` + "`" + `]+`,
  allowedDomains: ["pages.dev", "workers.dev"],
};

export const DEFAULT_REPOS: RepoConfig[] = [
  { owner: "KAIT-EDTC", repo: "dashboard", preview: { ...DEFAULT_PREVIEW } },
  { owner: "KAIT-EDTC", repo: "EDTCHP_v2", preview: { ...DEFAULT_PREVIEW } },
];

/** "owner/repo" や GitHubのURLを解釈する */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    s.match(/^(?:https?:\/\/)?github\.com\/([\w.-]+)\/([\w.-]+)/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function repoKey(r: { owner: string; repo: string }) {
  return `${r.owner}/${r.repo}`;
}

interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const REPOS_KEY = "settings.repos.v1";

export function loadRepos(storage: SimpleStorage): RepoConfig[] {
  try {
    const raw = storage.getItem(REPOS_KEY);
    if (!raw) return DEFAULT_REPOS;
    const parsed = JSON.parse(raw) as RepoConfig[];
    if (!Array.isArray(parsed)) return DEFAULT_REPOS;
    return parsed.map((r) => ({ ...r, preview: { ...DEFAULT_PREVIEW, ...r.preview } }));
  } catch {
    return DEFAULT_REPOS;
  }
}

export function saveRepos(storage: SimpleStorage, repos: RepoConfig[]) {
  storage.setItem(REPOS_KEY, JSON.stringify(repos));
}
