import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthRequiredError, GitHubError } from "./lib/github.ts";
import { persister, ServicesProvider } from "./services.tsx";
import { App } from "./ui/App.tsx";
import { applyTheme } from "./ui/theme.ts";
import "./styles.css";

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // 保存したキャッシュは1日まで使う（すぐ表示して、裏で取り直す）
      gcTime: 24 * 60 * 60_000,
      // ログインし直しや権限不足のエラーは繰り返さない
      retry: (count, err) =>
        !(err instanceof AuthRequiredError) &&
        !(err instanceof GitHubError && [403, 404, 422].includes(err.status)) &&
        count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

// 大きくて使い回さないもの（ログ・差分）と、失敗したものは保存しない
const NOT_PERSISTED = new Set(["jobLog", "pullFiles", "preview"]);

async function clearCache() {
  queryClient.clear();
  await persister.removeClient();
}

// Service Worker の登録は vite-plugin-pwa が自動で差し込む（registerType: autoUpdate）
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60_000,
        buster: "2",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success" && !NOT_PERSISTED.has(String(q.queryKey[0])),
        },
      }}
    >
      <ServicesProvider onClearCache={clearCache}>
        <App />
      </ServicesProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
