import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthRequiredError, GitHubClient, GitHubError } from "../src/lib/github.ts";
import { PatAuthProvider } from "../src/lib/auth.ts";
import { MemoryStore } from "../src/lib/kv.ts";
import { fakeFetch, makeClient } from "./helpers.ts";

test("Authorizationとバージョンのヘッダーを付ける", async () => {
  const { client, calls } = await makeClient(() => ({ body: { login: "fami" } }));
  const me = await client.getViewer();
  assert.equal(me.login, "fami");
  const h = calls[0].init!.headers as Record<string, string>;
  assert.equal(h.Authorization, "Bearer test-token");
  assert.equal(h["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(calls[0].url, "https://api.github.com/user");
});

test("トークンが無ければ通信せずにログインを求める", async () => {
  const f = fakeFetch(() => ({ body: {} }));
  const client = new GitHubClient({ auth: new PatAuthProvider(new MemoryStore()), fetch: f.fn });
  await assert.rejects(client.getViewer(), AuthRequiredError);
  assert.equal(f.calls.length, 0);
});

test("401はAuthRequiredErrorになる", async () => {
  const { client } = await makeClient(() => ({ status: 401, body: { message: "Bad credentials" } }));
  await assert.rejects(client.getViewer(), AuthRequiredError);
});

test("その他のエラーはGitHubのメッセージを添える", async () => {
  const { client } = await makeClient(() => ({ status: 404, body: { message: "Not Found" } }));
  await assert.rejects(client.getPull("o", "r", 1), (e: unknown) => {
    assert.ok(e instanceof GitHubError);
    assert.equal(e.status, 404);
    assert.match(e.message, /Not Found/);
    return true;
  });
});

test("レート制限ヘッダーとPAT期限ヘッダーを読む", async () => {
  const { client } = await makeClient(() => ({
    body: [],
    headers: {
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4990",
      "x-ratelimit-reset": "1800000000",
      "github-authentication-token-expiration": "2027-01-01 00:00:00 +0900",
    },
  }));
  await client.listOpenPulls("KAIT-EDTC", "dashboard");
  assert.equal(client.rateLimit?.remaining, 4990);
  assert.equal(client.tokenExpiration, "2027-01-01 00:00:00 +0900");
});

test("同時リクエスト数を上限で抑える", async () => {
  let active = 0;
  let peak = 0;
  const auth = new PatAuthProvider(new MemoryStore());
  await auth.signIn({ token: "t" });
  const client = new GitHubClient({
    auth,
    maxConcurrent: 2,
    fetch: async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response("{}", { status: 200 });
    },
  });
  await Promise.all(Array.from({ length: 6 }, () => client.getViewer()));
  assert.equal(peak, 2);
});

test("api.github.com以外には送らない", async () => {
  const { client, calls } = await makeClient(() => ({ body: {} }));
  await assert.rejects(client.request("https://evil.example.com/x"));
  assert.equal(calls.length, 0);
});
