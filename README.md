# UFT — ローカルファースト Markdown ワークスペース

Markdown、画像、図表をブラウザ内だけで作成・編集し、Markdown・PDF・ZIP として出力する静的 SPA です。

設計判断の詳細は [技術スタック決定](docs/_plans/technology-stack.md) と [ADR 0001](docs/adr/0001-local-first-editor-stack.md) を参照してください。

## Run locally

```bash
pnpm install # Bun を利用できる環境では bun install
pnpm dev     # Bun を利用できる環境では bun run dev
```

## 検証

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
```

Cloudflare Pages では build command に `bun run build`、output directory に `dist` を指定します。

## 保存と配信

UFT は OPFS 上の SQLite を使い、対応しない環境では IndexedDB の互換保存モードへ切り替えます。ユーザーのコンテンツをサーバーへ送信しません。ブラウザのサイトデータを削除するとローカルデータも失われるため、**ZIP バックアップ**を定期的にダウンロードしてください。

ZIP は文書、画像、SVG、図表 JSON を含む再編集可能なバックアップです。復元時はパス走査・サイズ・チェックサム・マニフェストを検証し、既存データを上書きせず新しいワークスペースとして開きます。単体 `.md` のダウンロードでは画像が相対参照になるため、アセットも渡す場合は ZIP を使います。

`public/_headers` は SQLite WASM の OPFS モードに必要な cross-origin isolation と静的セキュリティヘッダーを、`public/_redirects` は SPA フォールバックを提供します。Pages Functions や外部データストアは不要です。
