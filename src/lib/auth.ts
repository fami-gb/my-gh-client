import type { KeyValueStore } from "./kv.ts";

// 認証層。GitHubクライアント層は getToken() だけを呼び、トークンの出どころを知らない。
// 今はPAT、将来は GitHubAppAuthProvider（OAuth + Workersでのトークン交換）に差し替える。
export interface AuthProvider {
  readonly kind: "pat" | "github-app";
  /** 期限切れなら内部で更新する（PATでは何もしない）。未ログインなら null。 */
  getToken(): Promise<string | null>;
  /** PATは入力されたトークンを受け取る。GitHub Appではリダイレクトを始める想定。 */
  signIn(input?: { token: string }): Promise<void>;
  signOut(): Promise<void>;
}

const TOKEN_KEY = "auth.pat.token";

export class PatAuthProvider implements AuthProvider {
  readonly kind = "pat" as const;
  private cached: string | null | undefined;
  private store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  async getToken() {
    if (this.cached === undefined) {
      this.cached = (await this.store.get(TOKEN_KEY)) ?? null;
    }
    return this.cached;
  }

  async signIn(input?: { token: string }) {
    const token = input?.token.trim();
    if (!token) throw new Error("トークンが空です");
    if (/\s/.test(token)) throw new Error("トークンに空白が含まれています");
    await this.store.set(TOKEN_KEY, token);
    this.cached = token;
  }

  async signOut() {
    await this.store.delete(TOKEN_KEY);
    this.cached = null;
  }
}
