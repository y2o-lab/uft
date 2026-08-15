# anydoc WASM による文書 Markdown インポート計画

## 概要

UFT に、ローカルで選択した文書を Markdown へ変換し、ワークスペースへ追加する機能を実装する。変換には Firecrawl の `@firecrawl/anydoc-wasm` を使用し、ファイルの内容はブラウザ外へ送信しない。

WASM の変換 API は同期的に動作するため、メインスレッドではなく専用 Web Worker で初期化・実行する。WASM は利用時だけ動的に読み込むため、通常の Markdown 編集画面の初期ロードには含めない。

## 対象形式と制約

初期リリースでは以下を選択可能にする。

| 分類 | 拡張子 |
| --- | --- |
| Word | `.doc`, `.docx`, `.docm` |
| PowerPoint | `.ppt`, `.pps`, `.pot`, `.pptx`, `.pptm`, `.ppsx`, `.ppsm` |
| Excel | `.xls`, `.xlsx`, `.xlsm`, `.xlsb` |
| OpenDocument | `.odt`, `.ods`, `.odp` |
| その他 | `.rtf`, `.epub`, `.csv`, `.pdf` |

- PDF はテキストを含むものだけを対象とし、スキャン画像だけの PDF は OCR せずエラーとして表示する。
- パスワード保護・破損・未対応形式は、他のファイルの成功を取り消さない個別エラーとして扱う。
- 初期リリースは Markdown 本文をワークスペースへ保存する。anydoc が抽出可能な埋め込み画像などのバイナリを UFT の `assets/` に展開する機能は、後続の拡張とする。

## URL とパス設計

### サイトでアクセスする URL

最初に表示する **`/` はツールランチャー** とし、文書変換の専用画面は **`/convert-to-markdown`**、既存の Markdown ワークスペースは **`/workspace`** とする。

Cloudflare Pages の既存 SPA フォールバックにより、各 URL へ直接アクセスしても `index.html` を読み込める。アプリケーション側では `window.location.pathname` を見て、ランチャーから各ツールを開く。新しいローカルツールはランチャーのカードとして追加する。

| URL | 表示する画面 |
| --- | --- |
| `/` | Markdown ワークスペースと文書変換を起動するツールランチャー |
| `/workspace` | 既存の Markdown ワークスペース |
| `/convert-to-markdown` | ファイル選択、変換状況、変換済み Markdown の追加先を扱う文書変換画面 |

変換完了後は、作成した最初の Markdown を選択して `/workspace?entry=<entry-id>` へ遷移する。既存のワークスペース画面を直接開いたときの挙動は維持する。

### ワークスペース内の生成先

変換結果は、ユーザーが作成する `docs/` と区別できるルート直下の `imports/` に保存する。

| 選択したファイル | 作成する Markdown パス |
| --- | --- |
| `meeting-notes.docx` | `imports/meeting-notes.md` |
| `sales.xlsx` | `imports/sales.md` |
| 同名の再インポート | `imports/meeting-notes-2.md` |

ファイル名は危険な文字を `-` に置換し、拡張子を除いた名前に `.md` を付与する。`imports/` フォルダが存在しなければ作成し、同名ファイルがある場合は `-2`, `-3` のように連番を付ける。元ファイルは保存せず、生成された Markdown を通常の UFT 文書として編集できる。

### 実装ファイル

| パス | 役割 |
| --- | --- |
| `src/lib/import/anydoc.worker.ts` | WASM の遅延初期化、変換、Worker 内エラーの正規化 |
| `src/lib/import/anydoc-client.ts` | UI と Worker のメッセージ通信、キャンセル、型定義 |
| `src/lib/import/document-import.ts` | ファイル検証、出力名・`imports/*.md` パス決定、ワークスペースへの追加 |
| `src/lib/import/document-import.test.ts` | 検証・パス重複回避・変換結果を扱う単体テスト |
| `src/App.svelte` | ファイル入力、コマンドパレット項目、進捗・成功／失敗表示 |
| `e2e/document-import.spec.ts` | ユーザー操作と作成 Markdown を確認する E2E テスト |

## 実装手順

1. `@firecrawl/anydoc-wasm` を依存関係へ追加し、Vite の production build で WASM のアセット解決を確認する。
2. Worker とクライアントを実装する。`File` のバイト列は transferable として渡し、Worker 側で `init()` を一度だけ実行して `toMarkdownBytes()` を呼び出す。
3. `document-import.ts` に、拡張子・MIME・1 ファイルあたりのサイズ・選択総量・重複名を検証する純粋なロジックを実装する。
4. `App.svelte` に複数選択可能な非表示ファイル入力と「文書を Markdown として追加」コマンドを追加する。変換ごとに `imports/` へ文書エントリを作り、最後に通常の保存処理へ接続する。
5. 進捗、成功件数、失敗した各ファイルと理由を UI に表示する。キャンセル時は未開始の変換を止め、完了済みの結果だけを保持する。
6. Worker をモックした単体テストと、実ファイル fixture を使う E2E テストを追加する。`pnpm check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` を実行する。
7. README に対応形式、ローカル処理、OCR・埋め込みアセットの制約を追記する。

## 完了条件

- 対応する複数の文書を選択すると、各ファイルが編集可能な `imports/*.md` として追加される。
- 失敗したファイルがあっても、成功した変換結果は保持される。
- 変換中に編集画面が操作不能にならない。
- 既存の保存、ZIP バックアップ／復元、Markdown ダウンロード、プレビューに回帰がない。
