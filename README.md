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

保存形式を更新する際は、旧形式を読む前方マイグレーションを追加します。移行前にはこのブラウザ内に完全な世代バックアップを残しますが、配信のロールバックは保存形式の復旧手段にはしません。データ形式変更後の不具合は、原則として修正版をロールフォワードで配信します。

ZIP は文書、画像、SVG、図表 JSON を含む再編集可能なバックアップです。復元時はパス走査・サイズ・チェックサム・マニフェストを検証し、現在開いているワークスペースへ取り込みます。同名の文書・図表・アセットは `(1)` のように連番を付けて保持します。単体 `.md` のダウンロードでは画像が相対参照になるため、アセットも渡す場合は ZIP を使います。

`public/_headers` は SQLite WASM の OPFS モードに必要な cross-origin isolation と静的セキュリティヘッダーを提供します。Cloudflare Pages はトップレベルの `404.html` がない静的 SPA を自動でルートへフォールバックするため、追加のリダイレクト設定は不要です。Pages Functions や外部データストアは不要です。

## 文書を Markdown に変換

最初に表示される `/` はツールランチャーです。Markdown の編集は `/workspace`、文書変換は `/convert-to-markdown`（またはワークスペースのコマンドパレットの「文書を Markdown として追加」）から直接開けます。ランチャーではツール名・機能で絞り込め、どの画面からでも <kbd>⌘/Ctrl + K</kbd> でページを離れずに Spotlight 風の検索ランチャーを開けます。<kbd>↑↓</kbd> と <kbd>Enter</kbd> で選択・起動、<kbd>Esc</kbd> で閉じられます。ワークスペースのコマンドパレットは <kbd>⌘/Ctrl + Shift + K</kbd> です。新しいローカルツールもこのランチャーへ追加できます。

ワークスペースは編集画面の「新規 WS」、コマンドパレット、または <kbd>⌘/Ctrl + Alt + N</kbd> から作成できます。

変換画面では、Word（`.doc`, `.docx`, `.docm`）、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、PDF を複数選択して Markdown に変換できます。変換は `@firecrawl/anydoc-wasm` を専用 Worker で実行するため、ファイル内容はブラウザ外へ送信されず、変換中も編集画面をブロックしません。

作成先は `imports/` です。同名のファイルは `-2`、`-3` のように連番を付け、元の文書ファイルは保存しません。PDF は埋め込みテキストを持つものだけに対応し、スキャン画像のみの PDF は OCR せず個別の変換エラーとして表示します。パスワード保護・破損・未対応のファイルも、ほかの成功した変換結果には影響しません。埋め込み画像などのバイナリを `assets/` へ展開する機能は現時点では提供しません。
