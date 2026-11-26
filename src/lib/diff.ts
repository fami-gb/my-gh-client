// PRの差分（REST の files[].patch、統合diff形式）を行に分ける。

export type DiffLineKind = "add" | "del" | "ctx" | "hunk" | "meta";
export type DiffSide = "LEFT" | "RIGHT";

export interface DiffLine {
  kind: DiffLineKind;
  /** 先頭の +/-/空白 を除いた本文。hunk では @@ 行全体 */
  text: string;
  oldNo?: number;
  newNo?: number;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parsePatch(patch: string | undefined): DiffLine[] {
  if (!patch) return [];
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  const lines = patch.split("\n");
  // 末尾の改行で空行が1つできるのを捨てる
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  for (const line of lines) {
    const h = line.match(HUNK);
    if (h) {
      oldNo = Number(h[1]);
      newNo = Number(h[2]);
      out.push({ kind: "hunk", text: line });
      continue;
    }
    const c = line[0];
    if (c === "+") out.push({ kind: "add", text: line.slice(1), newNo: newNo++ });
    else if (c === "-") out.push({ kind: "del", text: line.slice(1), oldNo: oldNo++ });
    else if (c === "\\") out.push({ kind: "meta", text: line.slice(1).trim() });
    else out.push({ kind: "ctx", text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
  }
  return out;
}

/** 行コメントを付けるときの位置。hunk や meta には付けられない。 */
export function lineAnchor(l: DiffLine): { side: DiffSide; line: number } | null {
  if (l.kind === "add" || l.kind === "ctx") return { side: "RIGHT", line: l.newNo! };
  if (l.kind === "del") return { side: "LEFT", line: l.oldNo! };
  return null;
}

export function anchorKey(side: DiffSide, line: number) {
  return `${side}:${line}`;
}

/** スレッド（GraphQLの diffSide と line）が差分のどの行に付くかを引けるようにする */
export function indexThreads<T extends { diffSide: DiffSide; line: number | null }>(threads: T[]) {
  const map = new Map<string, T[]>();
  for (const t of threads) {
    if (t.line == null) continue; // 古くなったコメント（outdated）は行に付けない
    const key = anchorKey(t.diffSide, t.line);
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  }
  return map;
}

/** GitHubと同じ5マスの増減グラフ */
export function diffstatBlocks(additions: number, deletions: number, blocks = 5): ("add" | "del" | "neutral")[] {
  const total = additions + deletions;
  if (total === 0) return Array(blocks).fill("neutral");
  const scale = total < blocks ? total / blocks : 1;
  const add = Math.round((additions / total) * blocks * scale);
  const del = Math.round((deletions / total) * blocks * scale);
  const out: ("add" | "del" | "neutral")[] = [];
  for (let i = 0; i < blocks; i++) out.push(i < add ? "add" : i < add + del ? "del" : "neutral");
  return out;
}

/** 差分ハンクの末尾 n 行（会話タブで行コメントの文脈を出す用） */
export function tailOfHunk(diffHunk: string, n = 4): DiffLine[] {
  const lines = parsePatch(diffHunk).filter((l) => l.kind !== "hunk");
  return lines.slice(-n);
}
