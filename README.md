# GH Mobile（v0.2）

スマホ向けの自作GitHubクライアント。見た目は GitHub（Primer）に寄せ、PC版でよく使う操作をアプリ内で完結できるようにした。

## できること

| 画面 | 機能 |
| --- | --- |
| ホーム | あなたの作業（レビュー依頼・自分のPR）、登録リポジトリ |
| PR一覧 | Open / Closed、検索（`author:` `label:` など GitHub の検索構文）、チェック状態・レビュー状態・コメント数、プレビューボタン |
| PR詳細・会話 | 本文（GitHubと同じMarkdown表示）、タイムライン（コメント・レビュー・コミット・ラベルなど）、行コメントのスレッド（返信・解決）、コメントの投稿・編集・削除、クローズ・再オープン、レビュアー・担当者・ラベル |
| PR詳細・マージ | レビュー・チェック・コンフリクトの状態、マージ（マージコミット / スカッシュ / リベース）、ブランチ更新、Ready for review、マージ後のブランチ削除 |
| PR詳細・コミット / チェック | コミット一覧、チェック一覧（Actionsのジョブはアプリ内のログへ） |
| PR詳細・変更ファイル | 差分（折り返し切替・ファイルごとの確認済み・たたむ）、行番号を押して行コメント（すぐ送る or レビューにまとめる）、レビュー送信（コメント / 承認 / 修正依頼） |
| Actions | ワークフローで絞り込み、実行一覧、実行詳細（ジョブ）、再実行（全部 / 失敗のみ / ジョブ単位）、キャンセル、手動実行（workflow_dispatch） |
| ジョブのログ | グループ折りたたみ（エラーのあるところだけ開く）、検索、エラーへ移動、実行中は自動更新 |
| 通知 | 未読 / すべて、リポジトリごと、既読・完了（Done）、すべて既読、PR・Issueはアプリ内で開く |
| Issue | 本文・コメント・返信・クローズ（通知から開く用の簡易版） |
| 設定 | アカウント・API残り、テーマ（端末 / ライト / ダーク）、リポジトリとプレビューの探し方 |

## 速さのための工夫

- **ページを読み直さない画面遷移**（pushState の小さなルーター）。戻るとスクロール位置も戻る。
- **押す前に読み始める**: PRやActionsの行に指が触れた時点（pointerdown / hover）で詳細を先読みする。
- **一覧のデータで先に描く**: PR詳細は一覧で取ってあった題名・状態をすぐ出し、残りを後から埋める。
- **1往復で取る**: 一覧・PR詳細は GraphQL で、タイムライン・スレッド・チェックまでまとめて取る。
- **前回の画面をすぐ出す**: 取得したデータを IndexedDB に保存し（24時間）、起動直後は保存分を表示しつつ裏で更新する。
- **大きな差分・ログは見える所から描く**（IntersectionObserver）。差分・ログ・Actions・通知の画面は分割して読み込み、起動後の空き時間に先読みする（PWAでは端末に保存）。

モックAPIでの計測（iPhone 13 相当、通信遅延150ms）: 一覧→PRの題名表示 約50ms、全体表示 約250ms、戻る 約20ms、再読み込み後の表示 約80ms。

## 動かし方

```sh
npm install
npm test          # ユニットテスト（Node 22.18以上。GitHubへの通信はモック。GraphQLは公開スキーマで検証）
npm run dev       # 開発サーバー（--host 付きなので同じLANの端末からも開ける）
npm run build     # 型チェック + 本番ビルド（dist/）
```

- **PCで見る**: `npm run dev` → `http://localhost:5173`
- **スマホだけで（Termux）**: `pkg install nodejs-lts` → `npm install && npm run dev` → Chromeで `http://localhost:5173`。ホーム画面に追加もできる。
- **常用する**: `dist/` を静的ホスティング（Cloudflare Pages など）に置くとHTTPSでインストールできる。

## サインイン（トークン）

- **クラシックPAT（おすすめ）**: スコープ `repo` `workflow` `notifications`。通知を含めて全部使える。組織がクラシックPATを禁止していると使えない。
- **Fine-grained PAT**: 使うリポジトリだけを選び、Pull requests・Contents・Actions・Issues を読み書き、Deployments・Commit statuses を読み取り。**GitHubの仕様で通知APIは使えない**ので、通知タブには代わりに「あなたの作業」を出す。

トークンは端末のIndexedDBだけに保存し、api.github.com 以外には送らない。

## プレビューの探し方（機能1）

1. **Deployments**: PRの最新コミット（head sha）のデプロイ → 環境ごとの最新デプロイ → 最新ステータス。success なら environment_url を開く。shaで見つからなければブランチ名（ref）でも探す。デプロイ中は「準備中」（20秒ごとに再確認）、失敗は「デプロイ失敗・ログ」。
2. **ボットのコメント**: 1で開けるURLが無いとき、PRの会話コメントからボットの一番新しいコメントを探し、許可ドメインのURLだけをボタンにする。

PR一覧（登録リポジトリのOpenなPR）とPR詳細の上部に出る。複数見つかったら選択シートを出す。

### 未確認（推測で入れている初期値）

- KAIT-EDTC/dashboard のワークフローがどの sha・ref・環境名でデプロイを登録しているか。初期値は「全環境」。
- Cloudflareのボット名（初期値 `cloudflare-workers-and-pages[bot]`）とコメントの書式。
- 許可ドメインの初期値は `pages.dev, workers.dev`。

いずれも設定画面で変えられる。

## 構成

```
src/lib/        依存なしのコア（テスト対象）
  github.ts     REST + GraphQL クライアント（同時6本まで、401処理、レート制限）
  gql.ts        GraphQLのクエリと型
  routes.ts     ハッシュルーティング（github.com と同じパス。github.com のリンクをアプリ内に変換）
  diff.ts       統合diffの解析、行コメントの位置
  log.ts        Actionsログの解析（グループ・エラー）
  status.ts     実行・チェックの状態
  notifications.ts / preview.ts / settings.ts / auth.ts / kv.ts
src/router.tsx  画面遷移・スクロール復元・先読み用 Link
src/ui/         React画面（Primer風のCSSは src/styles.css）
test/           node:test のユニットテスト
```

- 安全対策: 本文はGitHubが描画したHTMLをさらに DOMPurify で無害化して表示。本番ビルドにCSP（スクリプトは自分のものだけ、通信先は api.github.com と Actions ログの保存先だけ）。
- APK化するときは `src/ui/open.ts`（外部ブラウザで開く）と、トークン保存（`kv.ts` → Android Keystore 系のプラグイン）を差し替える。

## 次にやること

- Issue一式（一覧・作成・ラベル/担当者の編集）
- コード閲覧（ファイルツリー・ブランチ・コミット履歴）
- 差分のシンタックスハイライト、複数行の行コメント
- 実際のPRで経路A・Bの環境名とボット名を確かめ、初期値を直す
