import type { DeploymentStatus, GitHubClient, IssueComment } from "./github.ts";
import type { PreviewConfig } from "./settings.ts";

// 機能1: PRの最新プレビューURLを探す。
// 経路A: head.sha の Deployments → 最新ステータスの environment_url（dashboard向け）
// 経路B: ボットのPRコメントからURLを抜く（EDTCHP_v2向け）

export type PreviewTargetState = "ready" | "pending" | "failed" | "inactive";

export interface PreviewTarget {
  source: "deployment" | "comment";
  /** 環境名、またはコメント由来ならURLのホスト名 */
  label: string;
  state: PreviewTargetState;
  url?: string;
  logUrl?: string;
  updatedAt: string;
}

export type PreviewSummary =
  | { kind: "ready"; targets: PreviewTarget[]; others: PreviewTarget[] }
  | { kind: "pending"; others: PreviewTarget[] }
  | { kind: "failed"; others: PreviewTarget[] }
  | { kind: "none"; others: PreviewTarget[] };

export interface PreviewInput {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  headRef: string;
}

export function mapDeploymentState(state: DeploymentStatus["state"] | undefined): PreviewTargetState {
  switch (state) {
    case "success":
      return "ready";
    case "queued":
    case "pending":
    case "in_progress":
    case undefined: // ステータスがまだ1件も無い = 作られた直後
      return "pending";
    case "inactive":
      return "inactive";
    default:
      return "failed";
  }
}

/** http/https 以外（javascript: など）は弾く */
export function safeHttpUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** https で、許可ドメインそのものかそのサブドメインのときだけ通す */
export function isAllowedUrl(raw: string, allowedDomains: string[]): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return allowedDomains.some((d) => {
      const dom = d.trim().toLowerCase().replace(/^\*?\./, "");
      return dom !== "" && (host === dom || host.endsWith("." + dom));
    });
  } catch {
    return false;
  }
}

function compileRegex(pattern: string, flags: string): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

export async function findDeploymentTargets(
  client: GitHubClient,
  input: PreviewInput,
  config: PreviewConfig,
): Promise<PreviewTarget[]> {
  const envFilter = compileRegex(config.environmentPattern, "i");
  let deployments = await client.listDeployments(input.owner, input.repo, { sha: input.headSha });
  if (deployments.length === 0) {
    // ワークフローがshaではなくブランチ名で登録している場合に備える（推測）
    deployments = await client.listDeployments(input.owner, input.repo, { ref: input.headRef });
  }
  if (envFilter) deployments = deployments.filter((d) => envFilter.test(d.environment));

  // 環境ごとに一番新しいデプロイだけを見る（APIは新しい順に返すが念のため並べ直す）
  const newestByEnv = new Map<string, (typeof deployments)[number]>();
  for (const d of [...deployments].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (!newestByEnv.has(d.environment)) newestByEnv.set(d.environment, d);
  }

  const targets = await Promise.all(
    [...newestByEnv.values()].map(async (d): Promise<PreviewTarget> => {
      const statuses = await client.listDeploymentStatuses(input.owner, input.repo, d.id);
      const latest = [...statuses].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const state = mapDeploymentState(latest?.state);
      const url = state === "ready" ? safeHttpUrl(latest?.environment_url) : undefined;
      return {
        source: "deployment",
        label: d.environment,
        // 成功でもURLが入っていなければ開けないので失敗扱いにはせず「URLなし」とする
        state: state === "ready" && !url ? "inactive" : state,
        url,
        logUrl: safeHttpUrl(latest?.log_url ?? latest?.target_url),
        updatedAt: latest?.created_at ?? d.updated_at,
      };
    }),
  );
  return targets;
}

export function extractCommentTargets(comments: IssueComment[], config: PreviewConfig): PreviewTarget[] {
  const bots = new Set(config.botLogins.map((b) => b.trim().toLowerCase()).filter(Boolean));
  const re = compileRegex(config.urlPattern, "g");
  if (!re || bots.size === 0) return [];

  // ボットは新しいコミットのたびに同じコメントを書き換えることが多いので updated_at で選ぶ（推測）
  const botComments = comments
    .filter((c) => c.user && bots.has(c.user.login.toLowerCase()) && c.body)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  for (const c of botComments) {
    const urls: string[] = [];
    for (const m of c.body!.matchAll(re)) {
      const url = m[0].replace(/[.,;:!?]+$/, "");
      if (isAllowedUrl(url, config.allowedDomains) && !urls.includes(url)) urls.push(url);
    }
    if (urls.length > 0) {
      return urls.map((url) => ({
        source: "comment" as const,
        label: new URL(url).hostname,
        state: "ready" as const,
        url,
        updatedAt: c.updated_at,
      }));
    }
  }
  return [];
}

export function summarize(targets: PreviewTarget[]): PreviewSummary {
  const ready = targets.filter((t) => t.state === "ready" && t.url);
  const others = targets.filter((t) => !ready.includes(t));
  if (ready.length > 0) {
    return {
      kind: "ready",
      targets: ready.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      others,
    };
  }
  if (targets.some((t) => t.state === "pending")) return { kind: "pending", others };
  if (targets.some((t) => t.state === "failed")) return { kind: "failed", others };
  return { kind: "none", others };
}

export async function resolvePreview(
  client: GitHubClient,
  input: PreviewInput,
  config: PreviewConfig,
): Promise<PreviewSummary> {
  let targets: PreviewTarget[] = [];
  if (config.strategy !== "comments") {
    targets = await findDeploymentTargets(client, input, config);
    const hasReady = targets.some((t) => t.state === "ready" && t.url);
    if (hasReady || config.strategy === "deployments") return summarize(targets);
  }
  const comments = await client.listIssueComments(input.owner, input.repo, input.number);
  return summarize([...targets, ...extractCommentTargets(comments, config)]);
}
