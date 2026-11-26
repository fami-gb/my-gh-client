// 実行やチェックの状態を「見た目の種類」にまとめる

import type { RunConclusion, RunStatus } from "./types.ts";

export type Tone = "success" | "failure" | "pending" | "running" | "neutral" | "skipped" | "cancelled" | "action";

export function runTone(status: RunStatus | null | undefined, conclusion: RunConclusion | undefined): Tone {
  if (status && status !== "completed") return status === "in_progress" ? "running" : "pending";
  switch (conclusion) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failure";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    case "action_required":
      return "action";
    default:
      return "neutral";
  }
}

/** GraphQLの CheckRun（status/conclusion は大文字） */
export function checkRunTone(status: string, conclusion: string | null): Tone {
  return runTone(status.toLowerCase() as RunStatus, (conclusion?.toLowerCase() ?? null) as RunConclusion);
}

/** コミット状態（StatusContext と statusCheckRollup） */
export function statusStateTone(state: string | null | undefined): Tone {
  switch (state?.toUpperCase()) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    default:
      return "neutral";
  }
}

export const TONE_LABEL: Record<Tone, string> = {
  success: "成功",
  failure: "失敗",
  pending: "待機中",
  running: "実行中",
  neutral: "完了",
  skipped: "スキップ",
  cancelled: "キャンセル",
  action: "要対応",
};

/** 「1分23秒」のような所要時間 */
export function formatDuration(startIso: string | null | undefined, endIso: string | null | undefined, now = Date.now()) {
  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : now;
  const sec = Math.max(0, Math.round((end - start) / 1000));
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分${sec % 60 ? `${sec % 60}秒` : ""}`;
  const h = Math.floor(min / 60);
  return `${h}時間${min % 60 ? `${min % 60}分` : ""}`;
}

/** 複数のチェックの集計（「3件成功、1件失敗」） */
export function summarizeTones(tones: Tone[]) {
  const counts = new Map<Tone, number>();
  for (const t of tones) counts.set(t, (counts.get(t) ?? 0) + 1);
  const order: Tone[] = ["failure", "action", "running", "pending", "cancelled", "success", "skipped", "neutral"];
  const overall: Tone =
    counts.has("failure") || counts.has("action")
      ? "failure"
      : counts.has("running") || counts.has("pending")
        ? "pending"
        : counts.has("success")
          ? "success"
          : "neutral";
  const parts = order.filter((t) => counts.has(t)).map((t) => `${counts.get(t)}件${TONE_LABEL[t]}`);
  return { overall, text: parts.join("、") };
}
