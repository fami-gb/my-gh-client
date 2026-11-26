import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCommentTargets, isAllowedUrl, resolvePreview, safeHttpUrl } from "../src/lib/preview.ts";
import { DEFAULT_PREVIEW, type PreviewConfig } from "../src/lib/settings.ts";
import { makeClient, type Route } from "./helpers.ts";

const PR = { owner: "KAIT-EDTC", repo: "dashboard", number: 42, headSha: "abc123", headRef: "feature/x" };
const BOT = { login: "cloudflare-workers-and-pages[bot]", avatar_url: "", html_url: "" };
const HUMAN = { login: "someone", avatar_url: "", html_url: "" };

function cfg(over: Partial<PreviewConfig> = {}): PreviewConfig {
  return { ...DEFAULT_PREVIEW, ...over };
}

/** deployments と statuses と comments の偽API */
function api(opts: {
  bySha?: unknown[];
  byRef?: unknown[];
  statuses?: Record<number, unknown[]>;
  comments?: unknown[];
}): Route {
  return (url) => {
    const p = url.pathname;
    if (p === "/repos/KAIT-EDTC/dashboard/deployments") {
      if (url.searchParams.get("sha")) return { body: opts.bySha ?? [] };
      if (url.searchParams.get("ref")) return { body: opts.byRef ?? [] };
    }
    const m = p.match(/\/deployments\/(\d+)\/statuses$/);
    if (m) return { body: opts.statuses?.[+m[1]] ?? [] };
    if (p === "/repos/KAIT-EDTC/dashboard/issues/42/comments") return { body: opts.comments ?? [] };
    return undefined;
  };
}

const dep = (id: number, environment: string, created_at: string) => ({
  id,
  sha: "abc123",
  ref: "feature/x",
  environment,
  created_at,
  updated_at: created_at,
});
const st = (state: string, created_at: string, environment_url?: string) => ({
  id: Math.floor(Math.random() * 1e6),
  state,
  environment_url,
  log_url: "https://github.com/KAIT-EDTC/dashboard/actions/runs/1",
  created_at,
});

test("経路A: 最新コミットのデプロイが成功ならそのURLを返す", async () => {
  const { client, calls } = await makeClient(
    api({
      bySha: [dep(1, "preview", "2026-11-26T01:00:00Z")],
      statuses: {
        1: [st("success", "2026-11-26T01:05:00Z", "https://pr-42.example.pages.dev"), st("in_progress", "2026-11-26T01:01:00Z")],
      },
    }),
  );
  const r = await resolvePreview(client, PR, cfg());
  assert.equal(r.kind, "ready");
  assert.ok(r.kind === "ready");
  assert.equal(r.targets[0].url, "https://pr-42.example.pages.dev/");
  assert.equal(r.targets[0].label, "preview");
  assert.equal(r.targets[0].logUrl, "https://github.com/KAIT-EDTC/dashboard/actions/runs/1");
  // 成功したのでコメントは読まない
  assert.ok(!calls.some((c) => c.url.includes("/comments")));
  assert.ok(calls[0].url.includes("sha=abc123"));
});

test("経路A: デプロイ中なら「準備中」", async () => {
  const { client } = await makeClient(
    api({ bySha: [dep(1, "preview", "2026-11-26T01:00:00Z")], statuses: { 1: [st("in_progress", "2026-11-26T01:01:00Z")] } }),
  );
  const r = await resolvePreview(client, PR, cfg());
  assert.equal(r.kind, "pending");
});

test("経路A: ステータスがまだ無いデプロイも「準備中」", async () => {
  const { client } = await makeClient(api({ bySha: [dep(1, "preview", "2026-11-26T01:00:00Z")], statuses: { 1: [] } }));
  assert.equal((await resolvePreview(client, PR, cfg())).kind, "pending");
});

test("経路A: 失敗なら「失敗」", async () => {
  const { client } = await makeClient(
    api({ bySha: [dep(1, "preview", "2026-11-26T01:00:00Z")], statuses: { 1: [st("failure", "2026-11-26T01:02:00Z")] } }),
  );
  assert.equal((await resolvePreview(client, PR, cfg())).kind, "failed");
});

test("経路A: shaで見つからなければブランチ名でも探す", async () => {
  const { client, calls } = await makeClient(
    api({
      bySha: [],
      byRef: [dep(5, "preview", "2026-11-26T01:00:00Z")],
      statuses: { 5: [st("success", "2026-11-26T01:05:00Z", "https://b.example.pages.dev")] },
    }),
  );
  const r = await resolvePreview(client, PR, cfg());
  assert.equal(r.kind, "ready");
  assert.ok(calls.some((c) => c.url.includes("ref=feature%2Fx")));
});

test("経路A: 環境が複数なら環境ごとの最新を選択肢にする", async () => {
  const { client } = await makeClient(
    api({
      bySha: [
        dep(1, "preview", "2026-11-26T01:00:00Z"),
        dep(2, "preview", "2026-11-26T02:00:00Z"),
        dep(3, "storybook", "2026-11-26T01:30:00Z"),
      ],
      statuses: {
        1: [st("success", "2026-11-26T01:05:00Z", "https://old.example.pages.dev")],
        2: [st("success", "2026-11-26T02:05:00Z", "https://new.example.pages.dev")],
        3: [st("success", "2026-11-26T01:35:00Z", "https://sb.example.pages.dev")],
      },
    }),
  );
  const r = await resolvePreview(client, PR, cfg());
  assert.ok(r.kind === "ready");
  assert.deepEqual(
    r.targets.map((t) => t.url),
    ["https://new.example.pages.dev/", "https://sb.example.pages.dev/"],
  );
});

test("経路A: 環境名の正規表現で絞り込む", async () => {
  const { client } = await makeClient(
    api({
      bySha: [dep(2, "production", "2026-11-26T02:00:00Z"), dep(3, "pr-preview", "2026-11-26T01:30:00Z")],
      statuses: {
        2: [st("success", "2026-11-26T02:05:00Z", "https://prod.example.com")],
        3: [st("success", "2026-11-26T01:35:00Z", "https://pr.example.pages.dev")],
      },
    }),
  );
  const r = await resolvePreview(client, PR, cfg({ environmentPattern: "preview" }));
  assert.ok(r.kind === "ready");
  assert.deepEqual(r.targets.map((t) => t.label), ["pr-preview"]);
});

test("経路A: javascript: のURLは開かない", async () => {
  const { client } = await makeClient(
    api({
      bySha: [dep(1, "preview", "2026-11-26T01:00:00Z")],
      statuses: { 1: [st("success", "2026-11-26T01:05:00Z", "javascript:alert(1)")] },
    }),
  );
  const r = await resolvePreview(client, PR, cfg({ strategy: "deployments" }));
  assert.equal(r.kind, "none");
});

const cfComment = (id: number, updated_at: string, body: string, user = BOT) => ({
  id,
  body,
  user,
  created_at: "2026-11-25T00:00:00Z",
  updated_at,
  html_url: `https://github.com/x/y/pull/42#issuecomment-${id}`,
});

// 推測: Cloudflareボットのコメント書式は未確認。よくある表の形を仮に使う。
const CF_BODY = `## Deploying edtchp with Cloudflare Pages
| Latest commit: | abc123 |
| Status: | ✅ Deploy successful! |
| Preview URL: | https://abc123.edtchp.pages.dev |
| Branch Preview URL: | https://feature-x.edtchp.pages.dev |
[View logs](https://dash.cloudflare.com/xxx)`;

test("経路B: デプロイが無ければボットコメントからURLを抜く", async () => {
  const { client } = await makeClient(api({ bySha: [], byRef: [], comments: [cfComment(1, "2026-11-26T01:00:00Z", CF_BODY)] }));
  const r = await resolvePreview(client, PR, cfg());
  assert.ok(r.kind === "ready");
  assert.deepEqual(
    r.targets.map((t) => t.url),
    ["https://abc123.edtchp.pages.dev", "https://feature-x.edtchp.pages.dev"],
  );
  assert.equal(r.targets[0].source, "comment");
});

test("経路B: ボット以外のコメントと、許可外ドメインのURLは使わない", () => {
  const targets = extractCommentTargets(
    [
      cfComment(1, "2026-11-26T03:00:00Z", "見て https://evil.pages.dev.attacker.com/x", HUMAN),
      cfComment(2, "2026-11-26T02:00:00Z", "ログ https://dash.cloudflare.com/x と http://plain.pages.dev"),
      cfComment(3, "2026-11-26T01:00:00Z", "Preview: https://ok.edtchp.pages.dev."),
    ],
    cfg(),
  );
  assert.deepEqual(targets.map((t) => t.url), ["https://ok.edtchp.pages.dev"]);
});

test("経路B: 書き換えられた一番新しいボットコメントを使う", () => {
  const targets = extractCommentTargets(
    [
      cfComment(1, "2026-11-26T05:00:00Z", "Preview URL: https://new.edtchp.pages.dev"),
      cfComment(2, "2026-11-26T01:00:00Z", "Preview URL: https://old.edtchp.pages.dev"),
    ],
    cfg(),
  );
  assert.deepEqual(targets.map((t) => t.url), ["https://new.edtchp.pages.dev"]);
});

test("経路B: ボット名は設定で変えられる", () => {
  const custom = { login: "my-deploy-bot[bot]", avatar_url: "", html_url: "" };
  const comments = [cfComment(1, "2026-11-26T01:00:00Z", "https://x.pages.dev", custom)];
  assert.equal(extractCommentTargets(comments, cfg()).length, 0);
  assert.equal(extractCommentTargets(comments, cfg({ botLogins: ["My-Deploy-Bot[bot]"] })).length, 1);
});

test("comments戦略ではDeploymentsを呼ばない", async () => {
  const { client, calls } = await makeClient(api({ comments: [cfComment(1, "2026-11-26T01:00:00Z", CF_BODY)] }));
  const r = await resolvePreview(client, PR, cfg({ strategy: "comments" }));
  assert.equal(r.kind, "ready");
  assert.ok(!calls.some((c) => c.url.includes("/deployments")));
});

test("どちらにも無ければ none", async () => {
  const { client } = await makeClient(api({ comments: [cfComment(1, "2026-11-26T01:00:00Z", "ビルド中…")] }));
  assert.equal((await resolvePreview(client, PR, cfg())).kind, "none");
});

test("URLの判定", () => {
  assert.equal(isAllowedUrl("https://a.b.pages.dev/x", ["pages.dev"]), true);
  assert.equal(isAllowedUrl("https://pages.dev", ["pages.dev"]), true);
  assert.equal(isAllowedUrl("https://notpages.dev", ["pages.dev"]), false);
  assert.equal(isAllowedUrl("http://a.pages.dev", ["pages.dev"]), false);
  assert.equal(isAllowedUrl("https://a.pages.dev", ["*.pages.dev"]), true);
  assert.equal(safeHttpUrl("data:text/html,hi"), undefined);
  assert.equal(safeHttpUrl("https://x.example/"), "https://x.example/");
});
