import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRunTone, formatDuration, runTone, statusStateTone, summarizeTones } from "../src/lib/status.ts";

test("実行の状態", () => {
  assert.equal(runTone("in_progress", null), "running");
  assert.equal(runTone("queued", null), "pending");
  assert.equal(runTone("completed", "success"), "success");
  assert.equal(runTone("completed", "timed_out"), "failure");
  assert.equal(runTone("completed", "cancelled"), "cancelled");
  assert.equal(runTone("completed", "skipped"), "skipped");
  assert.equal(checkRunTone("COMPLETED", "FAILURE"), "failure");
  assert.equal(checkRunTone("IN_PROGRESS", null), "running");
  assert.equal(statusStateTone("SUCCESS"), "success");
  assert.equal(statusStateTone("ERROR"), "failure");
  assert.equal(statusStateTone("EXPECTED"), "pending");
});

test("所要時間", () => {
  assert.equal(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:42Z"), "42秒");
  assert.equal(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:03:05Z"), "3分5秒");
  assert.equal(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z"), "2時間");
  assert.equal(formatDuration(null, null), "");
});

test("チェックのまとめ", () => {
  assert.deepEqual(summarizeTones(["success", "success", "failure"]), { overall: "failure", text: "1件失敗、2件成功" });
  assert.equal(summarizeTones(["success", "running"]).overall, "pending");
  assert.equal(summarizeTones(["success", "skipped"]).overall, "success");
});
