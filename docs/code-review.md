# コードレビューとセキュリティ解析

[upto PR #93](https://github.com/y2o-lab/upto/pull/93) を参考に、UFT の Svelte 5 / TypeScript / Vite 構成に合わせて設定する。

## CodeRabbit

設定は [`.coderabbit.yaml`](../.coderabbit.yaml) に置く。

- 自動レビューの対象は `main` 向けのドラフト以外の PR とする。
- レビューと会話は簡潔な日本語、要約は最大3項目とする。
- 静的解析には既存の `biome.json` に合わせて Biome を使い、Oxc と ESLint は無効にする。
- `README.md` と `docs/adr/*.md` を全ファイルのレビュー規約として参照する。
- ソース、テスト、保存形式の migration、CI、Terraform、運用ドキュメントを対象に残す。カバレッジ、Playwright のレポート・実行結果、`artifacts/` は除外する。
- パスごとに、Svelte の操作性、Markdown の往復変換、保存と復元、E2E の再現性、GitHub Actions の認証情報を重点的に確認する。

初回は GitHub App の対象リポジトリに `y2o-lab/uft` を追加する。PR で日本語のレビューと要約が出ることを確認する。[CodeRabbit のセットアップ](https://docs.coderabbit.ai/getting-started/quickstart)

自動レビューがサービス側の利用条件でスキップされた場合は、PR の CodeRabbit コメントに表示される **Trigger review** を選ぶ。コメントから開始する場合は `@coderabbitai review` を単独で記載する。[レビューコマンド](https://docs.coderabbit.ai/reference/review-commands)

### レビュー指摘への対応

Storymesh のレビュー運用を参考に、インラインの指摘とレビュー本文の両方を確認する。レビュー本文には差分外の指摘も載る。[Storymesh のレビュー例](https://github.com/y2o-lab/storymesh/pull/46#pullrequestreview-5723518634)

1. 最新のコミットで指摘の根拠と影響範囲を確認し、修正済みの指摘を切り分ける。
2. 残っている不具合は通常の操作か、挙動を検証するテストで再現する。修正後に同じ手順を再実行する。
3. 変更範囲に応じて `pnpm check`、`pnpm lint`、`pnpm test`、`pnpm build` と該当する E2E を実行し、実際に実行した結果を記録する。

## CodeQL

設定は [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) に置く。

- JavaScript/TypeScript と GitHub Actions を別ジョブで `security-extended` により解析する。Terraform と WASM バイナリはこの解析対象に含まれない。
- `main` 向け PR、`main` への push、`main` の merge queue、毎週水曜 12:23 JST、手動実行に対応する。手動実行も `main` に限定する。
- ビルドや依存関係のインストール、本番 Secrets は不要。ジョブの権限を限定し、Action はコミット SHA に固定する。
- タイムアウトは30分とし、古い PR 実行だけをキャンセルする。merge queue では解析を実行し、結果のアップロードは行わない。

GitHub の **Settings → Code security → Code scanning** で、既存の Default setup が有効な場合は無効にし、このワークフローによる Advanced setup に切り替える。非公開リポジトリでは GitHub Code Security の利用条件も確認する。設定方法は [GitHub の公式ドキュメント](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options) を参照する。

PR で `Analyze (javascript-typescript)` と `Analyze (actions)` が成功し、**Security → Code scanning** に結果が表示されることを確認する。スケジュールと手動実行は、ワークフローがデフォルトブランチに入ってから確認する。
