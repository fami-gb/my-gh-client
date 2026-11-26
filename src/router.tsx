import { useLayoutEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { parentOf, parseHash, type Route } from "./lib/routes.ts";

// pushState でハッシュを書き換える小さなルーター。
// - 画面遷移はページを読み直さず、キャッシュ済みのデータですぐ描く
// - 戻ったときは前のスクロール位置に戻す

interface NavState {
  key: string;
  depth: number;
}

let current = parseHash(location.hash);
let navType: "push" | "pop" = "pop";
const listeners = new Set<() => void>();
const scrollPositions = new Map<string, number>();

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

function state(): NavState {
  const s = history.state as NavState | null;
  return s && typeof s.key === "string" ? s : { key: "root", depth: 0 };
}

if (typeof history !== "undefined") {
  history.scrollRestoration = "manual";
  if (!(history.state as NavState | null)?.key) history.replaceState({ key: newKey(), depth: 0 }, "");
}

function emit() {
  current = parseHash(location.hash);
  for (const l of listeners) l();
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = to.startsWith("#") ? to : "#" + to;
  if (target === location.hash && !opts.replace) return;
  scrollPositions.set(state().key, window.scrollY);
  const depth = state().depth;
  if (opts.replace) history.replaceState({ key: newKey(), depth }, "", target);
  else history.pushState({ key: newKey(), depth: depth + 1 }, "", target);
  navType = "push";
  emit();
}

let lastKey = typeof history !== "undefined" ? state().key : "root";
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    scrollPositions.set(lastKey, window.scrollY);
    navType = "pop";
    emit();
  });
  // 手でハッシュを書き換えた場合など
  window.addEventListener("hashchange", () => {
    if (!(history.state as NavState | null)?.key) history.replaceState({ key: newKey(), depth: state().depth }, "");
    navType = "push";
    emit();
  });
  // Markdown の中のリンクなど、<Link> 以外の「#/」リンクもページ遷移なしで開く
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a");
    const h = a?.getAttribute("href");
    if (!a || !h || !h.startsWith("#/") || a.target === "_blank") return;
    e.preventDefault();
    navigate(h);
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}

/** 画面が変わったらスクロール位置を決める。戻るときは前の位置へ（描画が追いつくまで少し待つ）。 */
export function useScrollRestoration(route: Route) {
  useLayoutEffect(() => {
    const key = state().key;
    lastKey = key;
    if (navType !== "pop") {
      window.scrollTo(0, 0);
      return;
    }
    const target = scrollPositions.get(key) ?? 0;
    let tries = 0;
    let frame = 0;
    const attempt = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 2 && tries++ < 30) frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [route]);
}

/** 戻る。アプリ内の履歴が無ければ親の画面へ。 */
export function goBack(route: Route) {
  if (state().depth > 0) history.back();
  else navigate(parentOf(route) ?? "#/", { replace: true });
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  /** 押しそう（ホバー・タッチ開始）になったら呼ぶ。データの先読みに使う。 */
  onIntent?: () => void;
  replace?: boolean;
};

export function Link({ href, onIntent, replace, onClick, ...rest }: LinkProps) {
  function click(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href, { replace });
  }
  return (
    <a
      href={href}
      onClick={click}
      onPointerDown={onIntent}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      {...rest}
    />
  );
}
