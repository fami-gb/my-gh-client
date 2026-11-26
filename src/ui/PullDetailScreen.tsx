import { useQuery } from "@tanstack/react-query";
import { DEFAULT_PREVIEW, repoKey } from "../lib/settings.ts";
import { useServices } from "../services.tsx";
import { openExternal } from "./open.ts";
import { PreviewButton, usePreview } from "./PreviewButton.tsx";
import { relativeTime } from "./time.ts";
import type { PreviewInput } from "../lib/preview.ts";
import type { PreviewConfig } from "../lib/settings.ts";

export function PullDetailScreen({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const { client, repos } = useServices();
  const config = repos.find((r) => repoKey(r) === `${owner}/${repo}`)?.preview ?? DEFAULT_PREVIEW;
  const q = useQuery({
    queryKey: ["pull", owner, repo, number],
    queryFn: () => client.getPull(owner, repo, number),
  });
  const pr = q.data;

  return (
    <main className="page">
      <header className="topbar">
        <a className="icon-btn" href="#/" aria-label="戻る">
          ←
        </a>
        <h1 className="ellipsis">
          {repo} #{number}
        </h1>
      </header>
      {q.isPending && <p className="center muted">読み込み中…</p>}
      {q.isError && <p className="center error">{q.error.message}</p>}
      {pr && (
        <>
          <div className="sticky-action">
            <PreviewButton
              large
              config={config}
              input={{ owner, repo, number, headSha: pr.head.sha, headRef: pr.head.ref }}
            />
          </div>
          <section className="card stack">
            <h2 className="pr-title">
              {pr.draft && <span className="badge">Draft</span>}
              {pr.title}
            </h2>
            <p className="muted small">
              {pr.user?.login ?? "?"} · {pr.head.ref} → {pr.base.ref} · {relativeTime(pr.updated_at)}更新
            </p>
            <p className="muted small mono">head {pr.head.sha.slice(0, 7)}</p>
            <button className="btn ghost" onClick={() => openExternal(pr.html_url)}>
              GitHubで開く
            </button>
          </section>
          <PreviewDetails
            config={config}
            input={{ owner, repo, number, headSha: pr.head.sha, headRef: pr.head.ref }}
          />
          <section className="card">
            <h3>説明</h3>
            {/* 他人が書いた本文なのでHTMLやMarkdownとして描画せず、そのまま文字で出す */}
            <pre className="body-text">{pr.body?.trim() || "（説明なし）"}</pre>
          </section>
        </>
      )}
    </main>
  );
}

const STATE_LABEL = { ready: "公開中", pending: "準備中", failed: "失敗", inactive: "無効" } as const;

/** どこからプレビューを見つけたかを出す（設定を合わせるときの手がかり） */
function PreviewDetails({ input, config }: { input: PreviewInput; config: PreviewConfig }) {
  const q = usePreview(input, config);
  const s = q.data;
  if (!s) return null;
  const all = s.kind === "ready" ? [...s.targets, ...s.others] : s.others;
  if (all.length === 0) {
    return (
      <section className="card small muted">
        このコミットのデプロイも、ボットのプレビューコメントも見つかりませんでした。設定の環境名やボット名が合っているか確認してください。
      </section>
    );
  }
  return (
    <section className="card small">
      <h3>見つかったプレビュー</h3>
      <ul className="plain">
        {all.map((t, i) => (
          <li key={i}>
            <strong>{t.label}</strong>（{t.source === "deployment" ? "Deployments" : "ボットのコメント"}）:{" "}
            {STATE_LABEL[t.state]} · {relativeTime(t.updatedAt)}
            {t.logUrl && (
              <>
                {" "}
                <button className="link" onClick={() => openExternal(t.logUrl!)}>
                  ログ
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
