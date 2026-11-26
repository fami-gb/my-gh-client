import { test } from "node:test";
import assert from "node:assert/strict";
import { diffstatBlocks, indexThreads, lineAnchor, parsePatch, tailOfHunk } from "../src/lib/diff.ts";

const PATCH = `@@ -1,4 +1,5 @@ function a() {
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
 return x;
@@ -10,2 +11,2 @@
-old
+new
\\ No newline at end of file`;

test("統合diffを行番号つきの行に分ける", () => {
  const lines = parsePatch(PATCH);
  assert.deepEqual(
    lines.map((l) => [l.kind, l.oldNo ?? null, l.newNo ?? null, l.text]),
    [
      ["hunk", null, null, "@@ -1,4 +1,5 @@ function a() {"],
      ["ctx", 1, 1, "const x = 1;"],
      ["del", 2, null, "const y = 2;"],
      ["add", null, 2, "const y = 3;"],
      ["add", null, 3, "const z = 4;"],
      ["ctx", 3, 4, "return x;"],
      ["hunk", null, null, "@@ -10,2 +11,2 @@"],
      ["del", 10, null, "old"],
      ["add", null, 11, "new"],
      ["meta", null, null, "No newline at end of file"],
    ],
  );
  assert.deepEqual(parsePatch(undefined), []);
});

test("行コメントの位置（追加・文脈は右、削除は左）", () => {
  const lines = parsePatch(PATCH);
  assert.deepEqual(lineAnchor(lines[1]), { side: "RIGHT", line: 1 });
  assert.deepEqual(lineAnchor(lines[2]), { side: "LEFT", line: 2 });
  assert.deepEqual(lineAnchor(lines[3]), { side: "RIGHT", line: 2 });
  assert.equal(lineAnchor(lines[0]), null);
});

test("スレッドを行に結びつける（古いものは除く）", () => {
  const map = indexThreads([
    { id: "a", diffSide: "RIGHT" as const, line: 2 },
    { id: "b", diffSide: "LEFT" as const, line: 2 },
    { id: "c", diffSide: "RIGHT" as const, line: 2 },
    { id: "d", diffSide: "RIGHT" as const, line: null },
  ]);
  assert.deepEqual(map.get("RIGHT:2")?.map((t) => t.id), ["a", "c"]);
  assert.deepEqual(map.get("LEFT:2")?.map((t) => t.id), ["b"]);
  assert.equal(map.size, 2);
});

test("増減の5マス", () => {
  assert.deepEqual(diffstatBlocks(10, 0), ["add", "add", "add", "add", "add"]);
  assert.deepEqual(diffstatBlocks(5, 5), ["add", "add", "add", "del", "del"]);
  assert.deepEqual(diffstatBlocks(0, 0), ["neutral", "neutral", "neutral", "neutral", "neutral"]);
  assert.deepEqual(diffstatBlocks(1, 1), ["add", "del", "neutral", "neutral", "neutral"]);
});

test("ハンクの末尾", () => {
  assert.deepEqual(tailOfHunk(PATCH, 2).map((l) => l.kind), ["add", "meta"]);
});
