import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon } from "@primer/octicons-react";
import {
  DEFAULT_PREVIEW,
  parseRepoInput,
  repoKey,
  type PreviewConfig,
  type PreviewStrategy,
  type RepoConfig,
} from "../lib/settings.ts";
import { navigate } from "../router.tsx";
import { useServices } from "../services.tsx";
import { AppHeader, Avatar } from "./components.tsx";
import { useViewer } from "./queries.ts";
import { applyTheme, loadTheme, type Theme } from "./theme.ts";

export function SettingsScreen() {
  const { auth, client, repos, setRepos, clearCache } = useServices();
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const [newRepo, setNewRepo] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  function add() {
    const parsed = parseRepoInput(newRepo);
    if (!parsed) return setAddError("owner/repo の形か、GitHubのURLを入れてください");
    if (repos.some((r) => repoKey(r).toLowerCase() === repoKey(parsed).toLowerCase())) {
      return setAddError("すでに追加されています");
    }
    setRepos([...repos, { ...parsed, preview: { ...DEFAULT_PREVIEW } }]);
    setNewRepo("");
    setAddError(null);
  }

  function update(i: number, next: RepoConfig) {
    setRepos(repos.map((r, j) => (j === i ? next : r)));
    void queryClient.invalidateQueries({ queryKey: ["preview"] });
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= repos.length) return;
    const next = [...repos];
    [next[i], next[j]] = [next[j], next[i]];
    setRepos(next);
  }

  async function logout() {
    if (!confirm("ログアウトして、この端末からトークンとキャッシュを消しますか？")) return;
    await auth.signOut();
    await clearCache();
    navigate("#/", { replace: true });
    await queryClient.resetQueries();
  }

  const rl = client.rateLimit;
  const v = viewer.data;
  const classic = client.scopes !== null;

  return (
    <>
      <AppHeader title="設定" back={false} />
      <main className="page">
        <h2 className="section-title">アカウント</h2>
        <div className="box">
          {v && (
            <div className="box-row">
              <Avatar src={v.avatar_url} login={v.login} size={40} />
              <div className="grow">
                <div className="text-bold">{v.name ?? v.login}</div>
                <div className="fg-muted small">
                  @{v.login} · {classic ? `クラシックPAT（${client.scopes!.join(", ") || "スコープなし"}）` : "Fine-grained PAT"}
                </div>
              </div>
            </div>
          )}
          {client.tokenExpiration && <div className="box-row small">トークンの期限: {client.tokenExpiration}</div>}
          {rl && (
            <div className="box-row small fg-muted">
              API残り {rl.remaining.toLocaleString()}/{rl.limit.toLocaleString()}（{rl.reset.toLocaleTimeString("ja-JP")} に回復）
            </div>
          )}
          <button className="box-row box-row-button fg-danger" onClick={logout}>
            ログアウト（トークンを端末から消す）
          </button>
        </div>

        <h2 className="section-title">表示</h2>
        <div className="box">
          <div className="box-row">
            <span className="grow">テーマ</span>
            <select
              value={theme}
              onChange={(e) => {
                const t = e.target.value as Theme;
                setTheme(t);
                applyTheme(t);
              }}
            >
              <option value="auto">端末に合わせる</option>
              <option value="light">ライト</option>
              <option value="dark">ダーク</option>
            </select>
          </div>
          <button
            className="box-row box-row-button"
            onClick={async () => {
              await clearCache();
              await queryClient.resetQueries();
            }}
          >
            <span className="grow">保存したデータ（キャッシュ）を消す</span>
            <ChevronRightIcon size={16} />
          </button>
        </div>

        <h2 className="section-title">リポジトリ</h2>
        <div className="box">
          <div className="box-row column">
            <div className="row-gap">
              <input
                className="grow"
                placeholder="owner/repo または GitHubのURL"
                value={newRepo}
                autoCapitalize="off"
                onChange={(e) => setNewRepo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <button className="btn btn-primary" onClick={add}>
                追加
              </button>
            </div>
            {addError && <p className="fg-danger small">{addError}</p>}
          </div>
          {repos.map((r, i) => (
            <RepoSettings
              key={repoKey(r)}
              repo={r}
              onChange={(next) => update(i, next)}
              onRemove={() => setRepos(repos.filter((_, j) => j !== i))}
              onUp={i > 0 ? () => move(i, -1) : undefined}
            />
          ))}
        </div>
        <p className="fg-muted small">
          トークンはこの端末のブラウザ内（IndexedDB）だけに保存し、api.github.com 以外には送りません。
        </p>
      </main>
    </>
  );
}

function RepoSettings({
  repo,
  onChange,
  onRemove,
  onUp,
}: {
  repo: RepoConfig;
  onChange: (r: RepoConfig) => void;
  onRemove: () => void;
  onUp?: () => void;
}) {
  const p = repo.preview;
  const set = (patch: Partial<PreviewConfig>) => onChange({ ...repo, preview: { ...p, ...patch } });
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <details className="box-row column repo-settings">
      <summary>
        <span className="text-bold">{repoKey(repo)}</span>
        <span className="fg-muted small"> プレビューの設定</span>
      </summary>
      <div className="form-stack">
        <label className="form-field">
          プレビューの探し方
          <select value={p.strategy} onChange={(e) => set({ strategy: e.target.value as PreviewStrategy })}>
            <option value="auto">Deployments → だめならボットのコメント</option>
            <option value="deployments">Deploymentsだけ</option>
            <option value="comments">ボットのコメントだけ</option>
          </select>
        </label>
        <label className="form-field">
          環境名（正規表現、空なら全部）
          <input
            defaultValue={p.environmentPattern}
            placeholder="例: preview|pr-"
            onBlur={(e) => set({ environmentPattern: e.target.value })}
          />
        </label>
        <label className="form-field">
          ボットのユーザー名（カンマ区切り）
          <input defaultValue={p.botLogins.join(", ")} onBlur={(e) => set({ botLogins: list(e.target.value) })} />
        </label>
        <label className="form-field">
          開いてよいドメイン（カンマ区切り）
          <input defaultValue={p.allowedDomains.join(", ")} onBlur={(e) => set({ allowedDomains: list(e.target.value) })} />
        </label>
        <label className="form-field">
          URLを抜く正規表現
          <input
            className="mono"
            defaultValue={p.urlPattern}
            onBlur={(e) => set({ urlPattern: e.target.value || DEFAULT_PREVIEW.urlPattern })}
          />
        </label>
        <div className="row-gap">
          {onUp && (
            <button className="btn btn-sm" onClick={onUp}>
              上へ
            </button>
          )}
          <button className="btn btn-sm btn-danger-outline" onClick={onRemove}>
            このリポジトリを外す
          </button>
        </div>
      </div>
    </details>
  );
}
