import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PatAuthProvider, type AuthProvider } from "./lib/auth.ts";
import { GitHubClient } from "./lib/github.ts";
import { IndexedDbStore, type KeyValueStore } from "./lib/kv.ts";
import { loadRepos, saveRepos, type RepoConfig } from "./lib/settings.ts";

interface Services {
  auth: AuthProvider;
  client: GitHubClient;
  repos: RepoConfig[];
  setRepos: (repos: RepoConfig[]) => void;
  clearCache: () => Promise<void>;
}

const Ctx = createContext<Services | null>(null);

// 1つのIndexedDBを、トークンと表示データのキャッシュで共用する
export const store: KeyValueStore = new IndexedDbStore();

/** 表示データのキャッシュをIndexedDBに残す。次に開いたとき、通信を待たずに前回の画面を出せる。 */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => store.get(k).then((v) => v ?? null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  },
  key: "query-cache.v1",
  throttleTime: 2000,
});

export function ServicesProvider({ children, onClearCache }: { children: ReactNode; onClearCache: () => Promise<void> }) {
  // ログイン部分はここで差し替える（将来: GitHubAppAuthProvider）
  const auth = useMemo<AuthProvider>(() => new PatAuthProvider(store), []);
  const client = useMemo(() => new GitHubClient({ auth }), [auth]);
  const [repos, setReposState] = useState(() => loadRepos(localStorage));
  const setRepos = (next: RepoConfig[]) => {
    saveRepos(localStorage, next);
    setReposState(next);
  };
  return (
    <Ctx.Provider value={{ auth, client, repos, setRepos, clearCache: onClearCache }}>{children}</Ctx.Provider>
  );
}

export function useServices() {
  const s = useContext(Ctx);
  if (!s) throw new Error("ServicesProvider がありません");
  return s;
}
