import { test } from "node:test";
import assert from "node:assert/strict";
import { apiUrlToHref, githubUrlToHref, href, parentOf, parseHash, pullHref } from "../src/lib/routes.ts";

test("ハッシュから画面を決める", () => {
  assert.deepEqual(parseHash(""), { name: "home" });
  assert.deepEqual(parseHash("#/settings"), { name: "settings" });
  assert.deepEqual(parseHash("#/notifications"), { name: "notifications" });
  assert.deepEqual(parseHash("#/notifications?all=1"), { name: "notifications", all: true });
  assert.deepEqual(parseHash("#/KAIT-EDTC/EDTCHP_v2"), { name: "pulls", owner: "KAIT-EDTC", repo: "EDTCHP_v2", state: "open", q: "" });
  assert.deepEqual(parseHash("#/a/b/pulls?state=closed&q=label%3Abug"), { name: "pulls", owner: "a", repo: "b", state: "closed", q: "label:bug" });
  assert.deepEqual(parseHash("#/a/b/pull/7"), { name: "pull", owner: "a", repo: "b", number: 7, tab: "conversation" });
  assert.deepEqual(parseHash("#/a/b/pull/7/files"), { name: "pull", owner: "a", repo: "b", number: 7, tab: "files" });
  assert.deepEqual(parseHash("#/a/b/issues/3"), { name: "issue", owner: "a", repo: "b", number: 3 });
  assert.deepEqual(parseHash("#/a/b/actions"), { name: "actions", owner: "a", repo: "b" });
  assert.deepEqual(parseHash("#/a/b/actions?workflow=12"), { name: "actions", owner: "a", repo: "b", workflow: 12 });
  assert.deepEqual(parseHash("#/a/b/actions/runs/99"), { name: "run", owner: "a", repo: "b", runId: 99 });
  assert.deepEqual(parseHash("#/a/b/actions/runs/99/job/5"), { name: "job", owner: "a", repo: "b", runId: 99, jobId: 5 });
  assert.deepEqual(parseHash("#/a/b/actions/runs/99/attempts/2/job/5"), { name: "job", owner: "a", repo: "b", runId: 99, jobId: 5 });
  assert.equal(parseHash("#/a/b/pull/x").name, "notfound");
  assert.equal(parseHash("#/a/b/pull/1/blame").name, "notfound");
  assert.equal(parseHash("#/%E0%A4/x/pull/1").name, "notfound");
});

test("リンクは往復できる", () => {
  const routes = [
    "#/",
    "#/notifications",
    "#/notifications?all=1",
    "#/settings",
    "#/KAIT-EDTC/dashboard/pulls",
    "#/a/b/pulls?state=closed&q=author%3Ame",
    "#/a/b/pull/42",
    "#/a/b/pull/42/checks",
    "#/a/b/issues/1",
    "#/a/b/actions",
    "#/a/b/actions?workflow=3",
    "#/a/b/actions/runs/1",
    "#/a/b/actions/runs/1/job/2",
  ];
  for (const r of routes) assert.equal(href(parseHash(r)), r);
  assert.deepEqual(parseHash(pullHref("KAIT-EDTC", "dashboard", 42)), {
    name: "pull",
    owner: "KAIT-EDTC",
    repo: "dashboard",
    number: 42,
    tab: "conversation",
  });
});

test("github.com のURLをアプリ内に変える", () => {
  assert.equal(githubUrlToHref("https://github.com/a/b/pull/3"), "#/a/b/pull/3");
  assert.equal(githubUrlToHref("https://github.com/a/b/pull/3/files"), "#/a/b/pull/3/files");
  assert.equal(githubUrlToHref("https://github.com/a/b/issues/9"), "#/a/b/issues/9");
  assert.equal(githubUrlToHref("https://github.com/a/b/actions/runs/1/job/2"), "#/a/b/actions/runs/1/job/2");
  assert.equal(githubUrlToHref("https://github.com/a/b"), "#/a/b/pulls");
  // 対応していない画面・他のサイト
  assert.equal(githubUrlToHref("https://github.com/a/b/blob/main/README.md"), null);
  assert.equal(githubUrlToHref("https://github.com/settings"), null);
  assert.equal(githubUrlToHref("https://example.com/a/b/pull/3"), null);
  assert.equal(githubUrlToHref("http://github.com/a/b/pull/3"), null);
  assert.equal(githubUrlToHref("javascript:alert(1)"), null);
});

test("APIのURLをアプリ内に変える", () => {
  assert.equal(apiUrlToHref("https://api.github.com/repos/a/b/pulls/5"), "#/a/b/pull/5");
  assert.equal(apiUrlToHref("https://api.github.com/repos/a/b/issues/5"), "#/a/b/issues/5");
  assert.equal(apiUrlToHref("https://api.github.com/repos/a/b/releases/5"), null);
  assert.equal(apiUrlToHref(null), null);
});

test("戻る先", () => {
  assert.equal(parentOf(parseHash("#/a/b/pull/1/files")), "#/a/b/pulls");
  assert.equal(parentOf(parseHash("#/a/b/actions/runs/1/job/2")), "#/a/b/actions/runs/1");
  assert.equal(parentOf(parseHash("#/")), null);
});
