import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolvePreview, type PreviewInput, type PreviewTarget } from "../lib/preview.ts";
import type { PreviewConfig } from "../lib/settings.ts";
import { useServices } from "../services.tsx";
import { openExternal } from "./open.ts";

export function usePreview(input: PreviewInput, config: PreviewConfig) {
  const { client } = useServices();
  return useQuery({
    // head.sha が変われば別のキャッシュになる
    queryKey: ["preview", input.owner, input.repo, input.number, input.headSha, config],
    queryFn: () => resolvePreview(client, input, config),
    staleTime: 30_000,
    // デプロイ中は20秒ごとに見直す
    refetchInterval: (q) => (q.state.data?.kind === "pending" ? 20_000 : false),
  });
}

export function PreviewButton({
  input,
  config,
  large = false,
}: {
  input: PreviewInput;
  config: PreviewConfig;
  large?: boolean;
}) {
  const q = usePreview(input, config);
  const [choosing, setChoosing] = useState(false);
  const cls = `btn preview ${large ? "large" : ""}`;

  if (q.isPending) return <button className={`${cls} ghost`} disabled>確認中…</button>;
  if (q.isError) {
    return (
      <button className={`${cls} ghost`} onClick={() => q.refetch()} title={q.error.message}>
        取得失敗・再試行
      </button>
    );
  }

  const s = q.data;
  const logUrl = s.others.find((t) => t.logUrl)?.logUrl;
  switch (s.kind) {
    case "ready": {
      const [first] = s.targets;
      if (s.targets.length === 1) {
        return (
          <button className={`${cls} primary`} onClick={() => openExternal(first.url!)}>
            プレビュー
          </button>
        );
      }
      return (
        <>
          <button className={`${cls} primary`} onClick={() => setChoosing(true)}>
            プレビュー（{s.targets.length}）
          </button>
          {choosing && <ChooseSheet targets={s.targets} onClose={() => setChoosing(false)} />}
        </>
      );
    }
    case "pending":
      return (
        <button className={`${cls} pending`} disabled>
          準備中
        </button>
      );
    case "failed":
      return logUrl ? (
        <button className={`${cls} failed`} onClick={() => openExternal(logUrl)}>
          失敗・ログ
        </button>
      ) : (
        <button className={`${cls} failed`} disabled>
          失敗
        </button>
      );
    default:
      return (
        <button className={`${cls} ghost`} disabled>
          プレビューなし
        </button>
      );
  }
}

function ChooseSheet({ targets, onClose }: { targets: PreviewTarget[]; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="プレビューを選ぶ">
        <h2>どのプレビューを開く？</h2>
        {targets.map((t) => (
          <button
            key={t.url}
            className="btn sheet-item"
            onClick={() => {
              openExternal(t.url!);
              onClose();
            }}
          >
            <span>{t.label}</span>
            <span className="muted small">{t.source === "deployment" ? "Deployments" : "ボットのコメント"}</span>
          </button>
        ))}
        <button className="btn ghost" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
