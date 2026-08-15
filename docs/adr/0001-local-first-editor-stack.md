# ADR 0001: ローカルファースト Markdown エディタの技術スタック

- Status: Accepted
- Date: 2026-08-15
- Decision makers: Product team

## Context

UFT は、ログインを要求せず、Markdown 文書・フォルダ階層・画像・図表をブラウザ内で編集するデザインドキュメント用エディタである。

ユーザーの文書はサーバーに送らず、Markdown・PDF・アセットをファイルとして出力できなければならない。図表は Mermaid のテキスト入力だけでなく、draw.io のような GUI 操作で作成・編集できる必要がある。配信先は Cloudflare Pages を想定する。

現在の React/Vite 実装はデザインプロトタイプであり、本決定に従ってプロダクト実装へ移行する。

## Decision

アプリケーション本体には **Svelte 5 + TypeScript + Vite** を採用する。Cloudflare Pages へ静的 SPA として配信し、ユーザーのデータはブラウザ内にのみ保存する。

### 採用する構成

| 領域 | 決定 | 備考 |
| --- | --- | --- |
| UI | Svelte 5（Runes） | エディタ中心の細かな状態更新を簡潔に扱う。 |
| 言語 | TypeScript（strict） | UI、Worker、エクスポート形式の型安全性を確保する。 |
| ビルド | Vite | 静的 SPA を `dist/` に生成する。SvelteKit は使わない。 |
| 開発ツール | Bun | パッケージ管理、スクリプト実行、ローカル開発に使う。本番ランタイムではない。 |
| 配信 | Cloudflare Pages（Functions なし） | `dist/` を CDN 配信する。ユーザー文書は配信基盤に保存しない。 |
| Markdown 編集 | CodeMirror 6 | ソース編集、ショートカット、選択範囲へのブロック挿入を担う。 |
| Markdown 表示 | Unified / remark / rehype + Mermaid | GFM を扱い、HTML は必ずサニタイズする。 |
| 図表 GUI | `@xyflow/svelte` | フローチャート、構成図、ER 図などをノードとエッジで編集する。 |
| Mermaid | `mermaid` | 既存 Mermaid の表示と、対応する図表の Markdown 出力に使う。 |
| 文書メタデータ | SQLite WASM | フォルダ、Markdown、アセット参照、図表メタデータ、履歴を保存する。 |
| バイナリアセット | OPFS | アップロード画像と生成 SVG/PNG をブラウザ内に保存する。 |
| DB 実行 | Web Worker | SQLite WASM の初期化・クエリを UI スレッドから分離する。 |
| Markdown バンドル出力 | `fflate` | Markdown、`assets/`、`diagrams/` を ZIP として出力・再読込する。 |
| PDF 出力 | print CSS + ブラウザ印刷 | 表示済み Markdown、SVG、画像を PDF として保存する。 |
| 品質 | Biome、Vitest、Playwright | 静的解析、単体テスト、ブラウザ E2E を行う。 |

### 実行環境の境界

```text
Bun: ローカル開発・依存関係の解決・ビルド・テスト
Cloudflare Pages: HTML / CSS / JS / WASM の静的配信
ブラウザ: Svelte、SQLite WASM、OPFS、CodeMirror、図表 GUI の実行
```

`Bun.serve`、`bun:sqlite`、`Bun.file` などの Bun 固有 API をアプリケーション本体へ持ち込まない。Cloudflare Pages は Bun サーバーを実行せず、ブラウザへビルド成果物を配信するだけである。

### データとエクスポートの方針

- ブラウザ内では SQL の論理的なフォルダ階層を持ち、画像と SVG の本体は OPFS に置く。
- Markdown 出力は標準的な相対アセット参照を使用する。例: `![認証フロー](assets/diagrams/auth-flow.svg)`。
- GUI 図表の編集データは `diagrams/*.uft.json` として ZIP に含める。画像だけの出力でも再編集可能性を失わないためである。
- Mermaid で表現可能な図のみ Mermaid コードブロックとして出力できる。任意の GUI 図表を Mermaid に完全変換することは保証しない。
- ログインや同期機能は持たない。サイトデータ削除・異なるブラウザ・異なるオリジンではデータを失うため、ZIP バックアップとインポートを初期リリースに含める。

## Alternatives considered

### Next.js 16.3

不採用。静的エクスポートでは Server Actions、Cookie、動的 API、ISR、既定の画像最適化などが使えない。今回の中心機能は OPFS、File API、SQLite WASM などブラウザ API であり、Next.js のサーバー機能を活用しない。

将来、認証、共有リンク、サーバー側 PDF 生成、SEO を重視した公開ページが必要になった場合は、マーケティングサイトまたは別アプリとして採用を再検討する。

### React + Vite

不採用。現行プロトタイプを最短で育てる場合には有効だが、新規のプロダクト基盤としては Svelte 5 の方が UI の状態管理とバンドルを小さく保ちやすい。React 資産を流用する価値が実装コストを上回る場合のみ再検討する。

### SvelteKit

不採用。SSR、サーバールート、認証を使わない。Vite による静的 SPA の方が構成と運用を単純にできる。

### Preact / Solid / Qwik

不採用。いずれも軽量な候補だが、今回必須の GUI 図表では Svelte Flow との統合が最も直接的である。フレームワークのランタイム差より、CodeMirror・Mermaid・図表エディタの遅延ロードを優先する。

### draw.io の iframe 埋め込み

不採用。外部サービスへの依存、オフライン性、保存形式の制御を避ける。初期版は Svelte Flow の自前 GUI を採用し、将来の互換性需要が確認できた場合のみ `.drawio` の入出力を検討する。

## Consequences

### Positive

- Cloudflare Pages のみで配信でき、サーバー費用と認証管理が不要になる。
- ユーザー文書を外部送信せず、オフライン編集と低レイテンシを実現できる。
- 図表、Mermaid、画像を GUI と Markdown の双方で扱える。
- 特定ホスティングに依存しない `dist/` を生成するため、静的ホストへの移設が容易である。

### Negative / risks

- データは端末・ブラウザ・オリジンに閉じる。同期・共同編集・復旧には別設計が必要である。
- SQLite WASM と OPFS は Worker とストレージ容量のエラーハンドリングを必要とする。
- 1 つのデータベースを複数タブで同時編集しないよう、Web Locks またはアプリ側の単一ライター制御を実装する。
- CodeMirror、Mermaid、図表エディタ、SQLite WASM は大きい。機能単位の dynamic import とバンドルサイズの継続監視が必要である。

## References

- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Cloudflare Pages build image (Bun): https://developers.cloudflare.com/pages/configuration/build-image/
- SQLite WASM persistence: https://sqlite.org/wasm/doc/tip/persistence.md
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Svelte Flow: https://svelteflow.dev/
- Next.js static export: https://nextjs.org/docs/app/guides/static-exports
