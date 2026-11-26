import { lazy, Suspense } from "react";
import { BellIcon, GearIcon, HomeIcon, AlertIcon } from "@primer/octicons-react";
import { AuthRequiredError } from "../lib/github.ts";
import type { Route } from "../lib/routes.ts";
import { Link, useRoute, useScrollRestoration } from "../router.tsx";
import { ErrorBox, Loading, useOnline } from "./components.tsx";
import { HomeScreen } from "./HomeScreen.tsx";
import { LoginScreen } from "./LoginScreen.tsx";
import { useNotifications, useViewer } from "./queries.ts";
import { PullScreen } from "./PullScreen.tsx";
import { PullsScreen } from "./PullsScreen.tsx";

// よく使う画面は最初から読み込み、Actions・通知・設定は必要になってから読む（PWAでは端末に保存済み）
const ActionsScreen = lazy(() => import("./ActionsScreens.tsx").then((m) => ({ default: m.ActionsScreen })));
const RunScreen = lazy(() => import("./ActionsScreens.tsx").then((m) => ({ default: m.RunScreen })));
const JobScreen = lazy(() => import("./ActionsScreens.tsx").then((m) => ({ default: m.JobScreen })));
const NotificationsScreen = lazy(() => import("./NotificationsScreen.tsx").then((m) => ({ default: m.NotificationsScreen })));
const SettingsScreen = lazy(() => import("./SettingsScreen.tsx").then((m) => ({ default: m.SettingsScreen })));
const IssueScreen = lazy(() => import("./IssueScreen.tsx").then((m) => ({ default: m.IssueScreen })));

// 起動して落ち着いたら残りの画面も先に読んでおく（初回の遷移でも待たない）
if (typeof window !== "undefined") {
  const warm = () => {
    void import("./ActionsScreens.tsx");
    void import("./NotificationsScreen.tsx");
    void import("./SettingsScreen.tsx");
    void import("./FilesTab.tsx");
    void import("./JobLog.tsx");
    void import("./IssueScreen.tsx");
  };
  if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1500);
}

export function App() {
  const route = useRoute();
  const viewer = useViewer();
  const online = useOnline();
  useScrollRestoration(route);

  if (viewer.error instanceof AuthRequiredError) return <LoginScreen reason={viewer.error.message} />;
  if (viewer.isPending) return <Loading />;
  if (viewer.isError && !viewer.data) {
    return (
      <main className="page">
        <p className="text-bold">GitHubに接続できませんでした。</p>
        <ErrorBox error={viewer.error} retry={() => viewer.refetch()} />
      </main>
    );
  }

  return (
    <div className="app">
      {!online && (
        <div className="offline-bar">
          <AlertIcon size={14} /> オフラインです。保存済みのデータを表示しています。
        </div>
      )}
      <div className="app-content">
        <Suspense fallback={<Loading />}>
          <Screen route={route} />
        </Suspense>
      </div>
      <BottomNav route={route} />
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <HomeScreen />;
    case "notifications":
      return <NotificationsScreen all={!!route.all} />;
    case "settings":
      return <SettingsScreen />;
    case "pulls":
      return <PullsScreen owner={route.owner} repo={route.repo} state={route.state} q={route.q} />;
    case "pull":
      return <PullScreen key={`${route.owner}/${route.repo}#${route.number}`} {...route} />;
    case "issue":
      return <IssueScreen owner={route.owner} repo={route.repo} number={route.number} />;
    case "actions":
      return <ActionsScreen owner={route.owner} repo={route.repo} workflow={route.workflow} />;
    case "run":
      return <RunScreen key={route.runId} owner={route.owner} repo={route.repo} runId={route.runId} />;
    case "job":
      return <JobScreen key={route.jobId} owner={route.owner} repo={route.repo} runId={route.runId} jobId={route.jobId} />;
    case "notfound":
      return (
        <main className="page">
          <p>この画面はありません: {route.path}</p>
          <Link className="btn" href="#/">
            ホームへ
          </Link>
        </main>
      );
  }
}

function BottomNav({ route }: { route: Route }) {
  const notes = useNotifications(false);
  const unread = notes.data?.filter((n) => n.unread).length ?? 0;
  const tab = route.name === "notifications" ? "notifications" : route.name === "settings" ? "settings" : "home";
  return (
    <nav className="bottom-nav" aria-label="メイン">
      <Link href="#/" className={tab === "home" ? "active" : ""} aria-current={tab === "home" ? "page" : undefined}>
        <HomeIcon size={22} />
        <span>ホーム</span>
      </Link>
      <Link
        href="#/notifications"
        className={tab === "notifications" ? "active" : ""}
        aria-current={tab === "notifications" ? "page" : undefined}
      >
        <span className="nav-icon">
          <BellIcon size={22} />
          {unread > 0 && <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>}
        </span>
        <span>通知</span>
      </Link>
      <Link href="#/settings" className={tab === "settings" ? "active" : ""} aria-current={tab === "settings" ? "page" : undefined}>
        <GearIcon size={22} />
        <span>設定</span>
      </Link>
    </nav>
  );
}
