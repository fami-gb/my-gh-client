import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServices } from "../services.tsx";

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

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
    <main className="page">
      <h1>GH Mobile</h1>
      {reason && reason !== "ログインが必要です" && <p className="warn">{reason}</p>}
      <form onSubmit={submit} className="card stack">
        <label htmlFor="pat">Fine-grained personal access token</label>
        <input
          id="pat"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="github_pat_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="btn primary" disabled={busy || !token.trim()}>
          {busy ? "確認中…" : "保存してはじめる"}
        </button>
        {error && <p className="error small">{error}</p>}
      </form>
      <section className="card small">
        <p>
          <a href={NEW_TOKEN_URL} target="_blank" rel="noopener noreferrer">
            GitHubでトークンを作る
          </a>
          ときの設定:
        </p>
        <ul>
          <li>Resource owner: KAIT-EDTC</li>
          <li>Repository access: 使うリポジトリだけ</li>
          <li>権限: Pull requests（読み取り）、Deployments（読み取り）、Contents（読み取り）。Metadataは自動で付く</li>
          <li>有効期限を付ける</li>
        </ul>
        <p className="muted">トークンはこの端末のブラウザ内（IndexedDB）だけに保存され、GitHub以外には送りません。</p>
      </section>
    </main>
  );
}
