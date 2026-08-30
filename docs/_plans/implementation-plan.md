# UFT 初期リリース 実装計画

- 状態: 実装開始前
- 作成日: 2026-08-15
- 根拠: [技術スタック決定](./technology-stack.md)、[ADR 0001](../adr/0001-local-first-editor-stack.md)
- 対象: ログイン・サーバー保存を持たない、ローカルファースト Markdown ワークスペースの初期リリース

## 1. 到達点

ユーザーがブラウザだけで Markdown 文書、画像、GUI 図表を作成・編集し、ブラウザ内へ安全に保存できる SPA を完成させる。ワークスペース全体は ZIP でバックアップ／復元でき、開いている Markdown は単体 `.md`、整形済みプレビューはブラウザの印刷機能から PDF として出力できる。

完成時に満たす利用者シナリオは次のとおり。

1. 初回アクセスでサンプル文書を含むローカルワークスペースが作られる。
2. フォルダと Markdown 文書を作成・名前変更・移動・削除し、再読み込み後も内容が残る。
3. Markdown を CodeMirror で編集し、GFM と Mermaid を含む安全なプレビューを確認できる。
4. 画像を取り込み、Markdown の相対パス参照として文書へ挿入できる。
5. GUI 図表を作成・編集し、SVG と編集用 JSON を保存できる。対応する図だけは Mermaid としても出力できる。
6. ワークスペースを ZIP に書き出し、別の空の環境へインポートして再編集できる。
7. 開いている文書を Markdown／PDF として出力できる。

## 2. スコープ境界と実装前提

### 含むもの

- Svelte 5 + TypeScript + Vite の静的 SPA
- SQLite WASM + OPFS によるワークスペースのメタデータ・本文永続化
- OPFS によるアセットバイナリ保存
- CodeMirror 6、Unified、Mermaid、Svelte Flow
- ZIP のインポート／エクスポート、Markdown の単体ダウンロード、ブラウザ印刷による PDF
- Cloudflare Pages 用の静的ビルド、PWA、単体・E2E テスト

### 明示的に含まないもの

- 認証、アカウント、クラウド同期、共有リンク、共同編集
- サーバー側への文書・アセット保存、Cloudflare Pages Functions
- draw.io iframe／ファイル互換、任意の Mermaid 構文の GUI 往復変換
- 複数タブでの同時編集。初期版では単一ライター制御で片方を読み取り専用または警告状態にする。

### 現在のリポジトリからの引継ぎ

- `src/App.svelte`、`workspace.ts`、`workspace-repository.ts`、`workspace.worker.ts` は土台として残す。
- `src/App.tsx` と `src/content.ts` は旧 React プロトタイプであり、現在のエントリポイントから参照されない。画面と操作の参考にはできるが、実装完了時には削除して Svelte 実装だけを残す。
- 依存パッケージと検証用スクリプトはすでに宣言済みである。個別 API の実装に入る時点で、ロック済みバージョンの公式 API とブラウザ対応を確認する。

## 3. 実装原則

1. **ローカル優先**: 編集内容とアセットをネットワークへ送らない。例外となる外部リソース（フォントなど）は原則排除する。
2. **書き出し可能性を先行**: UI 機能より先に、永続化と ZIP 復元可能性を確立する。
3. **メインスレッドを塞がない**: SQLite 操作、ZIP 処理、Mermaid、Svelte Flow は機能を開くまで動的 import する。DB は Worker の RPC 越しに扱う。
4. **壊れないデータモデル**: スキーマはバージョン管理し、すべての破壊的操作は確認・復元可能な導線・エラー通知を持たせる。
5. **安全な表示**: Markdown HTML は必ず sanitize する。画像・ZIP の入力はサイズ、パス、MIME を検証する。
6. **段階的に完成させる**: 各フェーズの受け入れ基準とテストが通ってから次へ進む。未完成の UI だけを先行させない。

## 4. 推奨アーキテクチャ

```text
Svelte UI
  ├─ stores: UI 状態、選択中ノード、編集バッファ、通知
  ├─ services: workspace / assets / export / import / preview
  ├─ CodeMirror 6（遅延ロード）
  ├─ Unified + Mermaid（遅延ロード）
  └─ Svelte Flow（遅延ロード）
          │
          └─ WorkspaceRepository RPC
                    │
                    └─ DB Worker
                         ├─ SQLite WASM + OPFS SQLite DB
                         └─ OPFS asset files
```

### 論理データモデル

SQLite のスキーマはマイグレーション番号とともに Worker 内で管理する。初期スキーマは以下を最小単位とする。

| エンティティ | 主な属性 | 用途 |
| --- | --- | --- |
| `workspaces` | `id`, `name`, `schema_version`, `created_at`, `updated_at` | ワークスペースのルート |
| `entries` | `id`, `workspace_id`, `parent_id`, `kind`, `name`, `path`, `sort_order`, `created_at`, `updated_at`, `deleted_at` | フォルダ、Markdown、図表定義を表すツリー。`kind` は `folder` / `markdown` / `diagram` |
| `documents` | `entry_id`, `content`, `revision`, `updated_at` | Markdown 本文 |
| `assets` | `id`, `workspace_id`, `path`, `media_type`, `byte_size`, `checksum`, `created_at` | OPFS 上のファイルの索引 |
| `diagram_documents` | `entry_id`, `format_version`, `graph_json`, `preview_asset_id`, `mermaid_source`, `updated_at` | Svelte Flow の再編集データと SVG 参照 |

- `entries.path` は表示・ZIP 出力用の正規化済み相対パスで、`..`、先頭 `/`、重複パスを許可しない。
- アセット本体は `assets/<asset-id>` のような OPFS 管理名で保存し、表示／エクスポート時に論理パスへ対応付ける。
- 書き込みは UI 側で短時間デバウンスし、Worker 側では順序保証付きキューへ直列化する。保存成功後の revision を UI へ返す。
- `navigator.locks` を使える環境では `uft-workspace-write` を取得する。取得できない場合は二重起動の警告と最後の保存競合を避ける UI を出す。

### 主要なモジュール境界

| モジュール | 責務 |
| --- | --- |
| `lib/domain/` | エンティティ型、パス検証、ツリー操作、ZIP マニフェスト型。ブラウザ API に依存しない。 |
| `lib/storage/` | Worker RPC、SQLite マイグレーション、OPFS アセット操作、保存キュー。 |
| `lib/workspace/` | 起動、選択、編集バッファ、オートセーブ、単一ライター状態の調整。 |
| `lib/markdown/` | CodeMirror 拡張、Markdown→安全な HTML、Mermaid レンダリング、相対アセット URL 解決。 |
| `lib/diagrams/` | Svelte Flow モデル、テンプレート、SVG 書き出し、対応範囲内の Mermaid 変換。 |
| `lib/transfer/` | ZIP のマニフェスト、インポート検証、エクスポート、単体 Markdown ダウンロード。 |
| `lib/print/` | 印刷対象・print CSS・PDF 出力前の待機状態。 |
| `components/` | Explorer、Editor、Preview、Command palette、Diagram editor、Dialog、Toast。 |

## 5. フェーズ別計画とタスク分解

### Phase 0 — 開発基盤と移行準備

**目的:** Svelte のみを実装基盤にし、以降の作業を検証可能にする。

- [ ] 既存の `pnpm check`、`pnpm lint`、`pnpm test`、`pnpm build` を実行し、ベースラインを記録する。
- [ ] Svelte のコンポーネント構成、CSS 方針、パスエイリアス、Vitest のブラウザ API モック方針を決める。
- [ ] 旧 React プロトタイプから残す UX（コマンドパレット、3 モード表示、テンプレート、ショートカット）を要件として抽出し、Svelte 用コンポーネントに対応付ける。
- [ ] 未参照の React プロトタイプと React 固有の型・依存が残らないよう削除する（参照する見た目は Svelte へ移植後にのみ削除）。
- [ ] エラー表示、通知、確認ダイアログ、ローディング状態の共通コンポーネントを用意する。

**完了条件:** Svelte の空のアプリが strict typecheck・lint・unit test・production build を通り、旧 React の実行コードがない。

### Phase 1 — ワークスペース永続化（最優先）

**目的:** ブラウザ再読込に耐える、破損しにくいローカルワークスペースを完成させる。

- [ ] domain 型を `WorkspaceFile` 中心の暫定モデルから、フォルダ・Markdown・図表・アセットメタデータを扱えるモデルへ拡張する。
- [ ] パス正規化、名前の検証、親子関係の検証、ツリー移動、衝突検出の純粋関数と unit test を作る。
- [ ] 型付きの Worker RPC プロトコル（request ID、成功／失敗応答、初期化状態、タイムアウト）を定義する。
- [ ] SQLite WASM を Worker 内で遅延初期化し、OPFS 永続 DB のオープン、スキーマ作成、番号付きマイグレーションを実装する。
- [ ] `WorkspaceRepository` を実装し、初回起動時だけ default workspace をトランザクションで投入する。
- [ ] `entries`、`documents`、`assets`、`diagram_documents` の CRUD と並行書き込みキューを実装する。
- [ ] OPFS asset store を実装する。バイナリ保存、読出し、削除、孤立ファイルのクリーンアップを扱う。
- [ ] Web Locks による単一ライター制御と、未対応／競合時の UI 状態を実装する。
- [ ] ストレージ初期化失敗、容量不足、DB 破損時に、データを上書きせず復旧案内とエクスポート可能な情報を示す。

**完了条件:** 文書の作成・編集・削除を再読み込み後にも復元できる。Worker の初期化・マイグレーション・CRUD・パス検証に unit/integration test があり、メイン UI は DB 初期化待ちで固まらない。

### Phase 2 — Explorer と文書編集ワークフロー

**目的:** 実用的なツリー操作と Markdown 編集を、ローカル保存へ正しく接続する。

- [ ] 起動フローを実装する（初期 UI 描画 → DB 遅延接続 → 最後に開いた文書または `docs/overview.md` を選択）。
- [ ] Explorer を実装する。展開／折りたたみ、選択、作成、名前変更、移動、削除、空状態を含める。
- [ ] 破壊的な削除は確認ダイアログを表示する。初期版の復元ポリシーを決め、実装する（推奨: 物理削除前に trash 相当の `deleted_at` を使い、同セッション中に取り消せる）。
- [ ] CodeMirror 6 を Markdown 文書を開くときだけ読み込み、編集・行番号・履歴・検索・キーマップを構成する。
- [ ] 編集バッファとオートセーブを接続する。保存中／保存済み／保存失敗／未保存の表示、文書切替時のフラッシュを実装する。
- [ ] Source / Split / Preview のモード切替と、モバイル幅での読みやすい単一ペイン表示を実装する。
- [ ] `Cmd/Ctrl+S`（即時保存）、`Cmd/Ctrl+K`（コマンドパレット）、Escape の一貫したショートカットを実装する。
- [ ] コマンドパレットに文書作成、図表挿入、表テンプレート、画像挿入、コードブロック、callout を追加する。

**完了条件:** キーボードだけで文書作成から編集・保存・切替ができ、再読み込み後もツリーと内容が再現される。主要操作の E2E が通る。

### Phase 3 — Markdown プレビューと画像

**目的:** Markdown を安全かつ忠実に見せ、ローカル画像を文書とともに扱えるようにする。

- [ ] Unified pipeline を実装する（`remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-sanitize` → `rehype-stringify`）。許可するタグ・属性・URL スキームを明示する。
- [ ] Markdown とアセット論理パスを解決し、OPFS Blob URL をプレビューへ渡す。URL の生成・解放を文書切替時に管理する。
- [ ] Mermaid コードブロックを検出した時だけ Mermaid を動的 import し、レンダリング・テーマ・構文エラー表示・アクセシブルな代替テキストを実装する。
- [ ] 画像ファイル選択、MIME・サイズ検証、OPFS 保存、衝突時のリネーム、Markdown 相対参照のカーソル位置への挿入を実装する。
- [ ] 表、タスクリスト、コード、リンク、callout の見た目とダーク／印刷時の崩れを整える。
- [ ] 外部リンクの `rel`、危険な HTML／プロトコルの無害化、壊れたアセット参照の明確な表示をテストする。

**完了条件:** GFM、画像、Mermaid を含む文書が安全にプレビューされる。画像と Mermaid のエラーが編集データを失わせず、外部スクリプトを実行できない。

### Phase 4 — GUI 図表と再編集可能な書き出し

**目的:** GUI で描いた図をワークスペース内で再編集し、Markdown へ安全に参照できるようにする。

- [ ] 図表ドメイン型（ノード、エッジ、ビューポート、バージョン、テンプレート）と JSON スキーマ検証を定義する。
- [ ] 新規図表作成フローを実装する。テンプレート（フロー、構成、ER）選択、名前、保存先を扱う。
- [ ] 図表編集を開く時だけ `@xyflow/svelte` を動的 import し、ノード追加・編集・削除・接続・移動・ズームを実装する。
- [ ] 編集ごとのデバウンス保存、SVG プレビュー書き出し、`assets/diagrams/<name>.svg` の更新、`diagrams/<name>.uft.json` 相当の論理データ保存を実装する。
- [ ] 文書へ SVG の相対参照を挿入する。元の図表への再編集導線を Explorer とプレビューに置く。
- [ ] 対応可能なフロー図だけ Mermaid へ変換する。非対応の形状・エッジは理由を表示し、SVG/JSON 出力は常に利用可能にする。
- [ ] 図表データの旧バージョンを将来移行できるよう `format_version` と migration hook を持たせる。

**完了条件:** 新規 GUI 図表を作り、保存後に再編集できる。SVG 参照入り Markdown と再編集用 JSON の両方が ZIP 出力に含まれる。対応外の Mermaid 変換でデータが失われない。

### Phase 5 — ZIP、Markdown、PDF の入出力

**目的:** ブラウザデータ消去や別端末への移行に耐えられる可搬性を提供する。

- [ ] ZIP マニフェスト仕様を定義する。形式バージョン、ワークスペース名、作成日時、各ファイルの論理パス・MIME・checksum を含める。
- [ ] エクスポート時に `docs/`、`assets/`、`diagrams/` とマニフェストを `fflate` で生成し、ストリーミングまたは進捗表示とキャンセルを用意する。
- [ ] インポート時に ZIP のサイズ、総展開サイズ、エントリ数、パス走査、重複、MIME、JSON 形式、参照整合性を検証する（ZIP Slip を防ぐ）。
- [ ] 既存ワークスペースを上書きしない方式を採る。推奨は「新規ワークスペースとしてインポート」で、明示確認時だけ置換を許可する。
- [ ] 正常な ZIP、部分欠損 ZIP、旧形式 ZIP、壊れた ZIP の結果を利用者にわかる形で報告する。
- [ ] 開いている文書を UTF-8 `.md` としてダウンロードする。アセットが相対参照であることを説明する。
- [ ] プレビュー専用の印刷レイアウトと `@media print` を実装する。印刷前に Mermaid／画像の読み込み完了を待ち、ブラウザの PDF 保存ダイアログを開く。

**完了条件:** エクスポートした ZIP をクリーンなブラウザプロファイルへインポートして、文書・画像・図表を再編集できる。危険／破損 ZIP は既存データを壊さず拒否する。単体 Markdown と印刷 PDF の導線が機能する。

### Phase 6 — PWA、アクセシビリティ、配信

**目的:** 静的ホストで信頼して使えるアプリへ仕上げる。

- [ ] 必要性を確認のうえ PWA manifest、アイコン、service worker のキャッシュ戦略を追加する。ワークスペースデータは Cache Storage ではなく従来どおり OPFS/SQLite に置く。
- [ ] オフライン初回／再訪問、アップデート時の古いアセット、ストレージ削除時の案内を検証する。
- [ ] キーボード操作、フォーカス管理、ダイアログ、色コントラスト、ARIA ラベルを点検し、主要フローをスクリーンリーダーで追えるようにする。
- [ ] バンドル分析を行い、SQLite WASM・Mermaid・Svelte Flow・fflate が初期チャンクに入らないことを確認する。
- [ ] Cloudflare Pages 用のビルド設定、SPA フォールバック、セキュリティヘッダーの可否、デプロイ手順を `README.md` に記載する。
- [ ] Preview 環境でスモークテストを行い、Pages の配信物から外部 API やサーバー保存に依存しないことを確認する。

**完了条件:** オフライン再訪問で既存ワークスペースを開ける。静的ビルドを Cloudflare Pages へ配置でき、遅延ロードとアクセシビリティの最低基準を満たす。

## 6. 横断タスク（各フェーズで継続）

### テスト戦略

| 層 | 対象 | 主な確認 |
| --- | --- | --- |
| Unit (Vitest) | domain、パス、ツリー、ZIP マニフェスト、Mermaid 変換 | 正常系・衝突・不正入力・データ互換性 |
| Integration (Vitest + Worker/OPFS モックまたは対応ブラウザ) | Repository、マイグレーション、保存キュー、asset store | 再起動後の復元、失敗時のロールバック、競合 |
| E2E (Playwright) | 利用者の主要フロー | 初回作成、編集保存、画像、図表、ZIP 往復、印刷画面 |
| Manual | 実ブラウザ | OPFS 対応、複数タブ、容量不足、アクセシビリティ、印刷 PDF |

最低限の E2E シナリオは以下とする。

1. 初回起動 → 文書編集 → 再読み込み後に内容が残る。
2. フォルダ・文書の作成／名前変更／移動／削除がツリーと保存内容へ反映される。
3. GFM、危険な HTML、Mermaid の正常・異常ケースをプレビューできる。
4. 画像追加後のプレビューと ZIP 復元後のプレビューが一致する。
5. 図表を編集 → SVG を文書へ挿入 → ZIP から再編集できる。
6. ZIP の不正パス・壊れたマニフェストを拒否して既存ワークスペースが残る。

### 性能・品質ゲート

- 各実装単位で `pnpm check`、`pnpm lint`、対象 `pnpm test` を実行する。
- フェーズ完了時に `pnpm build` と対象 E2E を実行する。
- 初期画面は SQLite、Mermaid、Svelte Flow、ZIP ライブラリの読込みを待たずに描画する。
- 大きなインポート／エクスポートと SVG 生成では UI のフリーズ、メモリ使用量、キャンセルを確認する。
- 発見したフォーマットや保存形式の変更は ADR または ZIP 仕様に記録し、migration test を追加する。

### セキュリティ・データ保護チェック

- Markdown HTML の sanitize を省略しない。URL スキームとリンク属性を allowlist する。
- ZIP のエントリ名を正規化し、絶対パス、`..`、重複、過大展開を拒否する。
- 取り込みファイルのサイズと許可 MIME を制限し、検証不能な SVG は安全な画像扱いにしない。
- 失敗した import／migration／save は既存データを上書きしない。可能な限り原因と次の操作（ZIP 再取得等）を提示する。
- 「ブラウザデータを削除するとデータが失われる」ことと、ZIP バックアップの導線を初回利用時・設定画面に表示する。

## 7. 実装順序と依存関係

```text
Phase 0 ──> Phase 1 ──> Phase 2 ──> Phase 3 ──> Phase 5 ──> Phase 6
                            │             │
                            └──> Phase 4 ─┘
```

- **最初のリリース可能な縦切り:** Phase 0–3。Markdown と画像をローカル保存し、最低限の ZIP バックアップを先行実装してから図表へ進む。
- **Phase 4 と Phase 5:** 図表を ZIP に含める設計が必要なため、ZIP マニフェストの雛形は Phase 1 で固定し、完全な入出力は Phase 4 の保存形式確定後に完成させる。
- **Phase 6:** 機能仕様が確定したあとに着手する。PWA を先行するとキャッシュがデバッグとスキーマ変更を複雑にする。

## 8. 実装セッションごとの成果物

別セッションで実装する際は、次の単位でコミットまたはレビュー可能な成果物を作る。

| セッション | 成果物 | 依存 |
| --- | --- | --- |
| A | Phase 0: Svelte 移行方針、共通 UI、React 遺物除去 | なし |
| B | Phase 1a: domain 型、パス／ツリー、Worker RPC、スキーマ | A |
| C | Phase 1b: SQLite/OPFS repository、asset store、保存キュー、ロック | B |
| D | Phase 2: Explorer、CodeMirror、オートセーブ、コマンドパレット | C |
| E | Phase 3: Unified preview、Mermaid、画像 | D |
| F | Phase 4: Svelte Flow、SVG/JSON 保存、Markdown 挿入 | C, D, E |
| G | Phase 5: ZIP 往復、Markdown/PDF 出力 | C, E, F |
| H | Phase 6: PWA、a11y、性能確認、Pages 配信 | G |

各セッションの開始時には、対象の受け入れ基準、既存の未コミット変更、ストレージ形式への影響を確認する。データ形式を変更する作業では、必ず migration と旧形式 fixture を同じ変更に含める。

## 9. 未決事項（実装開始時に確定）

以下は方針書と矛盾しないが、実装前に明文化が必要である。決まるまでは推奨値を用いる。

| 論点 | 推奨初期値 | 理由 |
| --- | --- | --- |
| 対象ブラウザ | 最新 2 世代の Chrome / Edge / Firefox / Safari。OPFS/SQLite の不足時は明示的に非対応案内 | 対応しない環境で誤って保存できたと誤認させない。 |
| 最大ファイルサイズ | 画像 20 MB、ZIP 200 MB、展開後合計 500 MB（実測・端末容量に応じ調整） | ブラウザメモリと ZIP bomb を保護する。 |
| 削除の保持 | 同セッション中の Undo と、ZIP バックアップを推奨。長期ゴミ箱は初期版で不要 | データモデルを複雑化せず誤削除を緩和する。 |
| ワークスペース数 | 複数作成可。初回は `My workspace` を 1 件だけ生成 | import を安全に新規ワークスペースとして受け入れられる。 |
| SVG の取り扱い | GUI が生成した SVG のみそのままプレビュー。外部 SVG はサニタイズまたは PNG 等へ限定 | スクリプト混入リスクを下げる。 |
| PWA | Phase 6 で導入判断。初期の開発・スキーマ変更中は無効 | 古いキャッシュによる不整合を避ける。 |

## 10. 完了判定

初期リリースは、以下をすべて満たした時点で完了とする。

- すべての Phase の完了条件を満たし、既定の `check`、`lint`、`test`、`build` が成功する。
- クリーンなブラウザプロファイルで ZIP 復元 E2E を通し、文書・画像・図表を再編集できる。
- 破損 ZIP、ストレージ失敗、Mermaid 構文エラー、複数タブを手動確認し、データを黙って失わない。
- 初期ロード時の遅延ロードを計測し、大型ライブラリが初期チャンクに混入していない。
- Cloudflare Pages のプレビュー環境で、ネットワークにユーザーコンテンツを保存しないことを確認する。
