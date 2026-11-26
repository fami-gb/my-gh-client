import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GitHubUser } from "../lib/github.ts";
import {
  DEFAULT_PREVIEW,
  parseRepoInput,
  repoKey,
  type PreviewConfig,
  type PreviewStrategy,
  type RepoConfig,
} from "../lib/settings.ts";
import { useServices } from "../services.tsx";

export function SettingsScreen({ viewer }: { viewer: GitHubUser }) {
  const { auth, client, repos, setRepos } = useServices();
  const queryClient = useQueryClient();
  const [newRepo, setNewRepo] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function add() {
    const parsed = parseRepoInput(newRepo);
    if (!parsed) return setAddError("owner/repo の形で入れてください");
    if (repos.some((r) => repoKey(r).toLowerCase() === repoKey(parsed).toLowerCase())) {
      return setAddError("すでに追加されています");
    }
    setRepos([...repos, { ...parsed, preview: { ...DEFAULT_PREVIEW } }]);
    setNewRepo("");
    setAddError(null);
  }

  function update(i: number, next: RepoConfig) {
    setRepos(repos.map((r, j) => (j === i ? next : r)));
    queryClient.invalidateQueries({ queryKey: ["preview"] });
  }

  async function logout() {
    await auth.signOut();
    location.hash = "#/";
    queryClient.clear();
    await queryClient.resetQueries();
  }

  const rl = client.rateLimit;
  return (
    <main className="page">
      <header className="topbar">
        <a className="icon-btn" href="#/" aria-label="戻る">
          ←
        </a>
        <h1>設定</h1>
      </header>

      <section className="card stack">
        <h2>アカウント</h2>
        <p>
          {viewer.login} としてログイン中（Fine-grained PAT）
        </p>
        {client.tokenExpiration && <p className="small">トークンの期限: {client.tokenExpiration}</p>}
        {rl && (
          <p className="small muted">
            API残り {rl.remaining}/{rl.limit}（{rl.reset.toLocaleTimeString("ja-JP")} に回復）
          </p>
        )}
        <button className="btn danger" onClick={logout}>
          ログアウト（トークンを端末から消す）
        </button>
      </section>

      <section className="card stack">
        <h2>リポジトリ</h2>
        <div className="row-inline">
          <input
            placeholder="owner/repo"
            value={newRepo}
            autoCapitalize="off"
            onChange={(e) => setNewRepo(e.target.value)}
          />
          <button className="btn" onClick={add}>
            追加
          </button>
        </div>
        {addError && <p className="error small">{addError}</p>}
      </section>

      {repos.map((r, i) => (
        <RepoSettings
          key={repoKey(r)}
          repo={r}
          onChange={(next) => update(i, next)}
          onRemove={() => setRepos(repos.filter((_, j) => j !== i))}
        />
      ))}
    </main>
  );
}

function RepoSettings({
  repo,
  onChange,
  onRemove,
}: {
  repo: RepoConfig;
  onChange: (r: RepoConfig) => void;
  onRemove: () => void;
}) {
  const p = repo.preview;
  const set = (patch: Partial<PreviewConfig>) => onChange({ ...repo, preview: { ...p, ...patch } });
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <details className="card">
      <summary>
        <strong>{repoKey(repo)}</strong>
      </summary>
      <div className="stack">
        <label>
          プレビューの探し方
          <select value={p.strategy} onChange={(e) => set({ strategy: e.target.value as PreviewStrategy })}>
            <option value="auto">Deployments → だめならボットのコメント</option>
            <option value="deployments">Deploymentsだけ</option>
            <option value="comments">ボットのコメントだけ</option>
          </select>
        </label>
        <label>
          環境名（正規表現、空なら全部）
          <input
            defaultValue={p.environmentPattern}
            placeholder="例: preview|pr-"
            onBlur={(e) => set({ environmentPattern: e.target.value })}
          />
        </label>
        <label>
          ボットのユーザー名（カンマ区切り）
          <input defaultValue={p.botLogins.join(", ")} onBlur={(e) => set({ botLogins: list(e.target.value) })} />
        </label>
        <label>
          開いてよいドメイン（カンマ区切り）
          <input
            defaultValue={p.allowedDomains.join(", ")}
            onBlur={(e) => set({ allowedDomains: list(e.target.value) })}
          />
        </label>
        <label>
          URLを抜く正規表現
          <input
            className="mono"
            defaultValue={p.urlPattern}
            onBlur={(e) => set({ urlPattern: e.target.value || DEFAULT_PREVIEW.urlPattern })}
          />
        </label>
        <button className="btn danger" onClick={onRemove}>
          このリポジトリを外す
        </button>
      </div>
    </details>
  );
}
