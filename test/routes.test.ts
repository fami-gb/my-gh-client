import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, pullHref } from "../src/lib/routes.ts";

test("ハッシュから画面を決める", () => {
  assert.deepEqual(parseHash(""), { name: "home" });
  assert.deepEqual(parseHash("#/settings"), { name: "settings" });
  assert.deepEqual(parseHash("#/r/KAIT-EDTC/EDTCHP_v2/pull/7"), {
    name: "pull",
    owner: "KAIT-EDTC",
    repo: "EDTCHP_v2",
    number: 7,
  });
  assert.deepEqual(parseHash("#/r/%E0%A4/x/pull/1"), { name: "home" });
});

test("PR詳細へのリンクは往復できる", () => {
  const href = pullHref("KAIT-EDTC", "dashboard", 42);
  assert.deepEqual(parseHash(href), { name: "pull", owner: "KAIT-EDTC", repo: "dashboard", number: 42 });
});
