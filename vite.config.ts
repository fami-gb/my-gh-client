import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 本番ビルドだけにCSPを入れる（開発サーバーはReactのインラインスクリプトを使うため）。
// 外部スクリプトは読まない。通信先はGitHub APIと、Actionsのログの一時保存先（APIがそこへリダイレクトする）だけ。
// 画像はGitHubが配る範囲（アバター・本文の添付・camo経由の外部画像）だけ。
const csp: Plugin = {
  name: "inject-csp",
  apply: "build",
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.githubusercontent.com https://github.com https://github.githubassets.com",
      "media-src https://*.githubusercontent.com https://github.com",
      "connect-src 'self' https://api.github.com https://*.blob.core.windows.net https://*.actions.githubusercontent.com",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
    ].join("; ");
    return html.replace(
      "<!--CSP-->",
      `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

export default defineConfig({
  // 静的ホスティングのサブパスでも動くように相対パスで出力する
  base: "./",
  plugins: [
    react(),
    csp,
    VitePWA({
      registerType: "autoUpdate",
      // アプリの殻だけをキャッシュする。APIの応答はTanStack Query側で持つ。
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "index.html",
      },
      manifest: {
        name: "GH Mobile",
        short_name: "GH Mobile",
        description: "スマホ向けのGitHubクライアント（PR・Actions・通知）",
        lang: "ja",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#f6f8fa",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
