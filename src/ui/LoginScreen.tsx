import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyIcon } from "@primer/octicons-react";
import { useServices } from "../services.tsx";

const NEW_FINE_GRAINED = "https://github.com/settings/personal-access-tokens/new";
const NEW_CLASSIC = "https://github.com/settings/tokens/new?scopes=repo,workflow,notifications&description=GH%20Mobile";

export function LoginScreen({ reason }: { reason?: string }) {
  const { auth, client } = useServices();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn({ token });
      await client.getViewer(); // 使えるトークンか確かめる
      setToken("");
      await queryClient.resetQueries();
    } catch (err) {
      await auth.signOut();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-mark">
        <KeyIcon size={32} />
      </div>
      <h1>GH Mobile にサインイン</h1>
      {reason && reason !== "ログインが必要です" && <div className="flash flash-warn">{reason}</div>}
      <form onSubmit={submit} className="box login-form">
        <label htmlFor="pat" className="text-bold">
          Personal access token
        </label>
        <input
          id="pat"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="github_pat_… または ghp_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="btn btn-primary btn-block" disabled={busy || !token.trim()}>
          {busy ? "確認中…" : "サインイン"}
        </button>
        {error && <p className="fg-danger small">{error}</p>}
      </form>
      <div className="box login-help small">
        <p className="text-bold">どちらかのトークンを作ってください</p>
        <p>
          <a href={NEW_CLASSIC} target="_blank" rel="noopener noreferrer">
            クラシックPAT
          </a>
          （おすすめ・通知も使える）: スコープ <code>repo</code> <code>workflow</code> <code>notifications</code>、有効期限を付ける。
          組織がクラシックPATを禁止している場合は使えません。
        </p>
        <p>
          <a href={NEW_FINE_GRAINED} target="_blank" rel="noopener noreferrer">
            Fine-grained PAT
          </a>
          : Resource owner に組織（例: KAIT-EDTC）、使うリポジトリだけを選び、権限は Pull requests・Contents・Actions・Issues
          を読み書き、Deployments・Commit statuses を読み取り。<span className="fg-muted">通知（Inbox）は使えません。</span>
        </p>
        <p className="fg-muted">トークンはこの端末のブラウザ内（IndexedDB）だけに保存され、api.github.com 以外には送りません。</p>
      </div>
    </main>
  );
}
