import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByRepo, notificationHref, notificationWebUrl } from "../src/lib/notifications.ts";
import type { Notification } from "../src/lib/types.ts";

function n(id: string, repo: string, type: string, url: string | null): Notification {
  return {
    id,
    unread: true,
    reason: "review_requested",
    updated_at: "2026-11-26T00:00:00Z",
    last_read_at: null,
    subject: { title: "t", url, latest_comment_url: null, type },
    repository: { full_name: repo, name: repo.split("/")[1], owner: { login: repo.split("/")[0], avatar_url: "" }, html_url: `https://github.com/${repo}` },
  };
}

test("通知の開き先", () => {
  assert.equal(notificationHref(n("1", "a/b", "PullRequest", "https://api.github.com/repos/a/b/pulls/3")), "#/a/b/pull/3");
  assert.equal(notificationHref(n("2", "a/b", "Issue", "https://api.github.com/repos/a/b/issues/4")), "#/a/b/issues/4");
  assert.equal(notificationHref(n("3", "a/b", "CheckSuite", null)), "#/a/b/actions");
  assert.equal(notificationHref(n("4", "a/b", "Release", "https://api.github.com/repos/a/b/releases/1")), null);
  assert.equal(notificationWebUrl(n("5", "a/b", "Commit", "https://api.github.com/repos/a/b/commits/abc")), "https://github.com/a/b/commit/abc");
});

test("リポジトリごとにまとめる（順番は保つ）", () => {
  const g = groupByRepo([n("1", "a/b", "Issue", null), n("2", "c/d", "Issue", null), n("3", "a/b", "Issue", null)]);
  assert.deepEqual(g.map((x) => [x.repo, x.items.map((i) => i.id)]), [["a/b", ["1", "3"]], ["c/d", ["2"]]]);
});
