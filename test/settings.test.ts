import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REPOS, loadRepos, parseRepoInput, saveRepos } from "../src/lib/settings.ts";

test("owner/repo とGitHubのURLを解釈する", () => {
  assert.deepEqual(parseRepoInput("KAIT-EDTC/EDTCHP_v2"), { owner: "KAIT-EDTC", repo: "EDTCHP_v2" });
  assert.deepEqual(parseRepoInput("https://github.com/KAIT-EDTC/dashboard/pull/12"), {
    owner: "KAIT-EDTC",
    repo: "dashboard",
  });
  assert.deepEqual(parseRepoInput("github.com/a/b.git"), { owner: "a", repo: "b" });
  assert.equal(parseRepoInput("not a repo"), null);
});

test("初期設定は2つのリポジトリ", () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  const repos = loadRepos(storage);
  assert.deepEqual(
    repos.map((r) => `${r.owner}/${r.repo}`),
    ["KAIT-EDTC/dashboard", "KAIT-EDTC/EDTCHP_v2"],
  );
  saveRepos(storage, [DEFAULT_REPOS[0]]);
  assert.equal(loadRepos(storage).length, 1);
});

test("壊れた保存値なら初期設定に戻す", () => {
  const storage = { getItem: () => "{oops", setItem: () => {} };
  assert.equal(loadRepos(storage), DEFAULT_REPOS);
});
