import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLog } from "../src/lib/log.ts";

const LOG = [
  "﻿2026-11-26T01:00:00.0000000Z Requested labels: ubuntu-latest",
  "2026-11-26T01:00:01.0000000Z ##[group]Run actions/checkout@v4",
  "2026-11-26T01:00:01.1000000Z with:",
  "2026-11-26T01:00:01.2000000Z ##[endgroup]",
  "2026-11-26T01:00:02.0000000Z ##[group]Run npm test",
  "2026-11-26T01:00:02.1000000Z [command]/usr/bin/npm test",
  "2026-11-26T01:00:03.0000000Z \u001b[31mnot ok 1 - adds\u001b[0m",
  "2026-11-26T01:00:04.0000000Z ##[error]Process completed with exit code 1.",
  "2026-11-26T01:00:05.0000000Z ##[warning]Node 16 is deprecated",
  "",
].join("\r\n");

test("グループ・エラー・コマンドを見分ける", () => {
  const p = parseLog(LOG);
  assert.equal(p.lineCount, 8);
  assert.equal(p.nodes.length, 3);
  assert.deepEqual(p.nodes[0], { type: "line", line: { no: 1, text: "Requested labels: ubuntu-latest", ts: "2026-11-26T01:00:00.0000000Z" } });
  const g1 = p.nodes[1];
  assert.ok(g1.type === "group");
  assert.equal(g1.title.text, "Run actions/checkout@v4");
  assert.equal(g1.hasError, false);
  const g2 = p.nodes[2];
  assert.ok(g2.type === "group");
  assert.equal(g2.hasError, true);
  assert.deepEqual(
    g2.lines.map((l) => [l.level ?? "", l.text]),
    [
      ["command", "/usr/bin/npm test"],
      ["", "not ok 1 - adds"],
      ["error", "Process completed with exit code 1."],
      ["warning", "Node 16 is deprecated"],
    ],
  );
  assert.deepEqual(p.errors.map((e) => e.no), [7]);
});

test("タイムスタンプの無いログもそのまま読む", () => {
  const p = parseLog("hello\n::error file=a.ts::boom\n");
  assert.equal(p.nodes.length, 2);
  assert.ok(p.nodes[1].type === "line" && p.nodes[1].line.level === "error" && p.nodes[1].line.text === "boom");
});
