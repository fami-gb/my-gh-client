import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthRequiredError } from "./lib/github.ts";
import { ServicesProvider } from "./services.tsx";
import { App } from "./ui/App.tsx";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // ログインし直しが要るエラーは繰り返さない
      retry: (count, err) => !(err instanceof AuthRequiredError) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

// Service Worker の登録は vite-plugin-pwa が自動で差し込む（registerType: autoUpdate）
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
