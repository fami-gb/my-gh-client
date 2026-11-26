import { useQuery } from "@tanstack/react-query";
import { AuthRequiredError } from "../lib/github.ts";
import { useRoute } from "../router.ts";
import { useServices } from "../services.tsx";
import { HomeScreen } from "./HomeScreen.tsx";
import { LoginScreen } from "./LoginScreen.tsx";
import { PullDetailScreen } from "./PullDetailScreen.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";

export function App() {
  const { client } = useServices();
  const route = useRoute();
  const viewer = useQuery({ queryKey: ["viewer"], queryFn: () => client.getViewer(), staleTime: 10 * 60_000 });

  if (viewer.isPending) return <div className="center muted">読み込み中…</div>;
  if (viewer.error instanceof AuthRequiredError) return <LoginScreen reason={viewer.error.message} />;
  if (viewer.isError) {
    return (
      <div className="center">
        <p>GitHubに接続できませんでした。</p>
        <p className="muted small">{viewer.error.message}</p>
        <button className="btn" onClick={() => viewer.refetch()}>
          再試行
        </button>
      </div>
    );
  }

  switch (route.name) {
    case "settings":
      return <SettingsScreen viewer={viewer.data} />;
    case "pull":
      return <PullDetailScreen owner={route.owner} repo={route.repo} number={route.number} />;
    default:
      return <HomeScreen viewer={viewer.data} />;
  }
}
