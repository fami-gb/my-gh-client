import { apiUrlToHref, href } from "./routes.ts";
import type { Notification } from "./types.ts";

export const REASON_LABEL: Record<string, string> = {
  review_requested: "レビュー依頼",
  mention: "メンション",
  team_mention: "チームへのメンション",
  author: "作成者",
  comment: "コメント",
  assign: "担当",
  state_change: "状態の変更",
  ci_activity: "CI",
  subscribed: "ウォッチ中",
  manual: "購読中",
  security_alert: "セキュリティ",
  approval_requested: "承認依頼",
  invitation: "招待",
  member_feature_requested: "機能リクエスト",
};

/** 通知を開いたときのアプリ内リンク。アプリに無い画面なら null（GitHubで開く）。 */
export function notificationHref(n: Notification): string | null {
  const [owner, repo] = n.repository.full_name.split("/");
  if (n.subject.type === "CheckSuite" || n.subject.type === "WorkflowRun") {
    return href({ name: "actions", owner, repo });
  }
  return apiUrlToHref(n.subject.url);
}

/** GitHubのWebで開くURL（アプリ内に無い種類のため） */
export function notificationWebUrl(n: Notification): string {
  const url = n.subject.url;
  const m = url?.match(/^https:\/\/api\.github\.com\/repos\/(.+)$/);
  if (m) {
    return "https://github.com/" + m[1].replace(/\/pulls\/(\d+)$/, "/pull/$1").replace(/\/commits\//, "/commit/");
  }
  return n.repository.html_url;
}

export function groupByRepo(list: Notification[]) {
  const groups = new Map<string, Notification[]>();
  for (const n of list) {
    const g = groups.get(n.repository.full_name);
    if (g) g.push(n);
    else groups.set(n.repository.full_name, [n]);
  }
  return [...groups.entries()].map(([repo, items]) => ({ repo, items }));
}
