# GH Mobile（試作 v0.1）

スマホ向けの自作GitHubクライアント。今回は機能1「PRからプレビューへすぐ飛ぶボタン」と、その土台
（PAT入力、リポジトリ指定、PR一覧、PR詳細）まで。

## 動かし方

```sh
npm install
npm test          # ユニットテスト（Node 22.18以上。GitHubへの通信はモック）
npm run dev       # 開発サーバー（--host 付きなので同じLANの端末からも開ける）
npm run build     # 型チェック + 本番ビルド（dist/）
```

### スマホで試す

- **Termuxだけで完結**: `pkg install nodejs-lts` → このフォルダで `npm install && npm run dev` → 同じスマホのChromeで `http://localhost:5173` を開く。localhost は安全な接続扱いなので、PWAとしてホーム画面に追加もできる。
- **PCで起動してLANから開く**: `npm run dev` で表示される `http://192.168.x.x:5173` をスマホで開く。画面は使えるが、httpのためホーム画面へのインストールとオフライン動作はできない。
- **常用する**: `npm run build` の `dist/` を静的ホスティング（Cloudflare Pages など）に置くとHTTPSでインストールできる。

## 最初の設定

1. GitHubで Fine-grained personal access token を作る（Resource owner: KAIT-EDTC、使うリポジトリだけ、権限は Pull requests / Deployments / Contents の読み取り、期限あり）。
2. アプリのログイン画面に貼る。トークンは端末のIndexedDBだけに保存し、api.github.com 以外には送らない。
3. 設定画面でリポジトリごとの「プレビューの探し方」を確認する。

## プレビューの探し方

1. **Deployments**: PRの最新コミット（head sha）のデプロイ → 環境ごとの最新デプロイ → 最新ステータス。
   success なら environment_url を開く。shaで見つからなければブランチ名（ref）でも探す。
   デプロイ中は「準備中」（20秒ごとに再確認）、失敗は「失敗・ログ」。
2. **ボットのコメント**: 1で開けるURLが無いとき、PRの会話コメントからボットの一番新しいコメントを探し、
   許可ドメインのURLだけをボタンにする。

複数見つかったら選択シートを出す。PR詳細には「見つかったプレビュー」の一覧も出すので、設定合わせの手がかりにする。

### 未確認（推測で入れている初期値）

- KAIT-EDTC/dashboard のワークフローがどの sha・ref・環境名でデプロイを登録しているか。初期値は「全環境」。
- Cloudflareのボット名（初期値 `cloudflare-workers-and-pages[bot]`）とコメントの書式。
- 許可ドメインの初期値は `pages.dev, workers.dev`。
- `github-authentication-token-expiration` 応答ヘッダーでPATの期限を表示している（返らなければ表示しない）。

いずれも設定画面で変えられる。

## 構成

```
src/lib/      依存なしのコア（テスト対象）
  auth.ts     AuthProvider と PatAuthProvider（将来 GitHub App OAuth に差し替え）
  github.ts   REST APIの薄いラッパー（同時4本まで、401処理、レート制限ヘッダー）
  preview.ts  プレビューURLの解決（Deployments → ボットコメント）
  settings.ts リポジトリごとの設定
  routes.ts   ハッシュルーティング
  kv.ts       IndexedDB / メモリの保存
src/ui/       React画面（ホーム、PR詳細、設定、ログイン）
test/         node:test のユニットテスト
```

- 安全対策: PR本文は文字としてそのまま表示（HTML/Markdownとして描画しない）。本番ビルドにCSPを入れ、通信先は api.github.com だけ。
- APK化するときは `src/ui/open.ts`（外部ブラウザで開く）と、トークン保存（`kv.ts` → Android Keystore 系のプラグイン）を差し替える。

## 次にやること

- 実際のPRで経路A・Bの環境名とボット名を確かめ、初期値を直す
- TanStack Query のIndexedDB永続化（起動直後に前回の一覧を出す）
- 機能2: 行コメントしやすいレビュー画面
