import { PatAuthProvider } from "../src/lib/auth.ts";
import { GitHubClient } from "../src/lib/github.ts";
import { MemoryStore } from "../src/lib/kv.ts";

export type Route = (url: URL, init?: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined;

/** URLのパスとクエリで応答を返す偽fetch。呼ばれたURLを記録する。 */
export function fakeFetch(route: Route) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    const r = route(new URL(input), init);
    if (!r) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? null), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...r.headers },
    });
  };
  return { fn, calls };
}

export async function makeClient(route: Route, token = "test-token") {
  const auth = new PatAuthProvider(new MemoryStore());
  await auth.signIn({ token });
  const f = fakeFetch(route);
  const client = new GitHubClient({ auth, fetch: f.fn });
  return { client, calls: f.calls, auth };
}
