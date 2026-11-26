import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrowserIcon, LinkExternalIcon } from "@primer/octicons-react";
import { resolvePreview, type PreviewInput, type PreviewTarget } from "../lib/preview.ts";
import { DEFAULT_PREVIEW, repoKey, type PreviewConfig } from "../lib/settings.ts";
import { useServices } from "../services.tsx";
import { RelTime, Sheet } from "./components.tsx";
import { openExternal } from "./open.ts";

export function usePreviewConfig(owner: string, repo: string): PreviewConfig {
  const { repos } = useServices();
  return repos.find((r) => repoKey(r).toLowerCase() === `${owner}/${repo}`.toLowerCase())?.preview ?? DEFAULT_PREVIEW;
}

export function usePreview(input: PreviewInput, config: PreviewConfig, enabled = true) {
  const { client } = useServices();
  return useQuery({
    // head.sha が変われば別のキャッシュになる
    queryKey: ["preview", input.owner, input.repo, input.number, input.headSha, config],
    queryFn: () => resolvePreview(client, input, config),
    staleTime: 30_000,
    enabled,
    // デプロイ中は20秒ごとに見直す
    refetchInterval: (q) => (q.state.data?.kind === "pending" ? 20_000 : false),
  });
}

/** PRのプレビューを開くボタン。compact は一覧の行用（見つからなければ何も出さない）。 */
export function PreviewButton({
  input,
  config,
  compact = false,
  enabled = true,
}: {
  input: PreviewInput;
  config: PreviewConfig;
  compact?: boolean;
  enabled?: boolean;
}) {
  const q = usePreview(input, config, enabled);
  const [choosing, setChoosing] = useState(false);
  const size = compact ? "btn-sm" : "";

  if (q.isPending) return compact ? null : <button className={`btn ${size}`} disabled>プレビュー確認中…</button>;
  if (q.isError) {
    return compact ? null : (
      <button className={`btn ${size}`} onClick={() => q.refetch()} title={q.error.message}>
        プレビュー取得失敗・再試行
      </button>
    );
  }

  const s = q.data;
  const logUrl = s.others.find((t) => t.logUrl)?.logUrl;
  switch (s.kind) {
    case "ready": {
      const [first] = s.targets;
      const many = s.targets.length > 1;
      return (
        <>
          <button
            className={`btn btn-preview ${size}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (many) setChoosing(true);
              else openExternal(first.url!);
            }}
          >
            <BrowserIcon size={16} />
            プレビュー{many ? `（${s.targets.length}）` : ""}
          </button>
          {choosing && <ChooseSheet targets={s.targets} onClose={() => setChoosing(false)} />}
        </>
      );
    }
    case "pending":
      return (
        <button className={`btn btn-pending ${size}`} disabled>
          <span className="dot-pulse" /> 準備中
        </button>
      );
    case "failed":
      return logUrl ? (
        <button
          className={`btn btn-danger-outline ${size}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternal(logUrl);
          }}
        >
          デプロイ失敗・ログ
        </button>
      ) : (
        <button className={`btn btn-danger-outline ${size}`} disabled>
          デプロイ失敗
        </button>
      );
    default:
      return compact ? null : (
        <button className={`btn ${size}`} disabled>
          プレビューなし
        </button>
      );
  }
}

function ChooseSheet({ targets, onClose }: { targets: PreviewTarget[]; onClose: () => void }) {
  return (
    <Sheet title="どのプレビューを開く？" onClose={onClose}>
      <div className="box">
        {targets.map((t) => (
          <button
            key={t.url}
            className="box-row box-row-button"
            onClick={() => {
              openExternal(t.url!);
              onClose();
            }}
          >
            <div className="grow">
              <div className="text-bold">{t.label}</div>
              <div className="fg-muted small">
                {t.source === "deployment" ? "Deployments" : "ボットのコメント"} · <RelTime iso={t.updatedAt} />
              </div>
            </div>
            <LinkExternalIcon size={16} />
          </button>
        ))}
      </div>
    </Sheet>
  );
}
