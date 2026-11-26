import { memo, useMemo } from "react";
import DOMPurify from "dompurify";
import { githubUrlToHref } from "../lib/routes.ts";

// GitHubが描画したHTML（bodyHTML）を表示する。GitHub側でも無害化されているが、
// トークンを持つこのアプリの中に入れるので、念のためもう一度 DOMPurify を通す。
// - github.com のPR・Issue・Actionsへのリンクはアプリ内の画面へ
// - それ以外のリンクは新しいタブで開く

let hooked = false;
function setupHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const raw = node.getAttribute("href");
      if (!raw) return;
      if (raw.startsWith("#")) return; // ページ内リンク（見出しなど）
      const abs = (() => {
        try {
          return new URL(raw, "https://github.com/").toString();
        } catch {
          return null;
        }
      })();
      const inApp = abs ? githubUrlToHref(abs) : null;
      if (inApp) {
        node.setAttribute("href", inApp);
        node.removeAttribute("target");
      } else if (abs) {
        node.setAttribute("href", abs);
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("decoding", "async");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
}

export function sanitize(html: string) {
  setupHooks();
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "form"],
    FORBID_ATTR: ["style"],
    ADD_ATTR: ["target"],
  });
}

export const Markdown = memo(function Markdown({ html, empty = "説明はありません" }: { html: string; empty?: string }) {
  const clean = useMemo(() => sanitize(html), [html]);
  if (!html.trim()) return <p className="fg-muted markdown-empty">{empty}</p>;
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: clean }} />;
});
