import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PatAuthProvider, type AuthProvider } from "./lib/auth.ts";
import { GitHubClient } from "./lib/github.ts";
import { IndexedDbStore } from "./lib/kv.ts";
import { loadRepos, saveRepos, type RepoConfig } from "./lib/settings.ts";

interface Services {
  auth: AuthProvider;
  client: GitHubClient;
  repos: RepoConfig[];
  setRepos: (repos: RepoConfig[]) => void;
}

const Ctx = createContext<Services | null>(null);

export function ServicesProvider({ children }: { children: ReactNode }) {
  // ログイン部分はここで差し替える（将来: GitHubAppAuthProvider）
  const auth = useMemo<AuthProvider>(() => new PatAuthProvider(new IndexedDbStore()), []);
  const client = useMemo(() => new GitHubClient({ auth }), [auth]);
  const [repos, setReposState] = useState(() => loadRepos(localStorage));
  const setRepos = (next: RepoConfig[]) => {
    saveRepos(localStorage, next);
    setReposState(next);
  };
  return <Ctx.Provider value={{ auth, client, repos, setRepos }}>{children}</Ctx.Provider>;
}

export function useServices() {
  const s = useContext(Ctx);
  if (!s) throw new Error("ServicesProvider がありません");
  return s;
}
