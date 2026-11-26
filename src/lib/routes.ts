// 依存を増やさないための小さなハッシュルーター（解析部分）。
// #/                         ホーム（PR一覧）
// #/settings                 設定
// #/r/:owner/:repo/pull/:n   PR詳細
export type Route =
  | { name: "home" }
  | { name: "settings" }
  | { name: "pull"; owner: string; repo: string; number: number };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  const pull = path.match(/^\/r\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
  if (pull) {
    try {
      return {
        name: "pull",
        owner: decodeURIComponent(pull[1]),
        repo: decodeURIComponent(pull[2]),
        number: Number(pull[3]),
      };
    } catch {
      return { name: "home" };
    }
  }
  if (path === "/settings") return { name: "settings" };
  return { name: "home" };
}

export function pullHref(owner: string, repo: string, number: number) {
  return `#/r/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull/${number}`;
}
