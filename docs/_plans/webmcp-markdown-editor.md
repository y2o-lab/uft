# Markdown エディタへの WebMCP 導入計画

作成日: 2026-10-02。状態: 5 ツールの実装・ローカル実機検証済み。試験公開と公開 origin の Origin Trial 検証は未実施。[検証記録](../verification/webmcp.md) に証拠と残項目を記載する。

基準コード: `origin/main` の `fca3d5e78e7e60396b1375c7decbe3c78387d244`。WebMCP の公開状況・一次資料は [調査資料](../webmcp.md) を参照する。以下のツール名・制限値・モジュール名は UFT の設計案であり、WebMCP の標準で定められたものではない。

## 目的と対象範囲

`/workspace` を開いたユーザーが、対応エージェントに「この文書を読んで見出しを整理する」「新しい Markdown 文書を作る」と依頼できるようにする。手動編集とエージェント操作が同じ文書状態、プレビュー、保存状態を使う。

初期の完成範囲は、現在開いているワークスペースの文書一覧、本文読み取り、文書切り替え、Markdown 作成、本文更新の 5 操作とする。導入は読み取り・切り替えの段階と、作成・編集の段階に分ける。編集段階まで完了して初期導入の完成と扱う。

文書削除、フォルダ作成・移動、他ワークスペースへの切り替え、画像・図表・ファイル取り込み、ZIP 復元、印刷・ダウンロードは後続の対象とする。ランチャー、変換画面、IP ツールにはエディタ用ツールを登録しない。AI チャット、モデル API キー、リモート MCP サーバー、外部通信は追加しない。

## 現在の実装と接続先

| 既存ファイル／処理 | 確認した実装 | 導入で使う箇所 |
| --- | --- | --- |
| [WorkspacePage.svelte](../../src/lib/pages/WorkspacePage.svelte) | ページ判定、選択文書、表示モード、`selectEntry`、`createWithName`、`editDocument`、500 ms の遅延保存、`saveNow` | ページの有効状態を判定し、文書操作と結果表示を接続 |
| [workspace-service.ts](../../src/lib/workspace/workspace-service.ts) | `createEntry`、`updateDocument`。更新時に revision を増やす | 文書作成・更新の共通ロジックを利用 |
| [workspace-session.ts](../../src/lib/workspace/workspace-session.ts) | 初期化、ワークスペース切り替え、BroadcastChannel とフォーカス時の同期 | 初期化後の登録、切り替え時の古い呼び出しの拒否、保存通知 |
| [workspace-repository.ts](../../src/lib/storage/workspace-repository.ts) | 現行の新規保存先は IndexedDB。OPFS SQLite は旧データの取り込み用 | 永続化の完了確認、編集用の条件付き書き込み |
| [workspace-sync.ts](../../src/lib/workspace/workspace-sync.ts) | エントリ・本文単位で `updatedAt` が新しい方を採用 | 保存の統合処理を再利用。競合検出自体は別途追加 |
| [CodeMirrorEditor.svelte](../../src/lib/components/CodeMirrorEditor.svelte) | 変更を `onChange` で通知。外部の `value` を dispatch で反映。history、Undo／Redo がある | 本文反映、Undo、保存中の一時的な編集制御を検証 |
| [public/_headers](../../public/_headers) | CSP、COOP／COEP、Permissions Policy がある。`tools` の禁止指定はない | 既存制限を維持し、試験用トークンを必要に応じて追加 |

README の OPFS を主保存先とする記述は、現行の repository 実装と異なる。導入実装で保存方式の説明をコードに合わせる。WebMCP を追加するための保存形式マイグレーションは予定しない。

既存の `revision` はタブごとに増えるため、異なる本文が同じ revision になる可能性がある。`saveNow` の Web Lock は保存を直列化するが、古い本文に基づく編集を自動的に拒否しない。revision 比較だけで競合対策が完成したとは扱わない。

## ツールの入出力

全ツールに現在の `workspaceId` を必須入力として渡す。初期値をエージェントが知るため、各ツールの説明には有効な workspace ID を固定テンプレートで添える。名前などのユーザー入力は説明に埋め込まず、一覧の出力にする。ワークスペースを切り替えると登録を更新する。

| ツール | 必須入力 | 任意入力 | 主な出力と副作用 |
| --- | --- | --- | --- |
| `uft_list_documents` | `workspaceId` | `offset`、`limit` | 削除されていない Markdown の ID・パス・parentId・revision・updatedAt、現在の選択 ID、次の offset。作成先候補のフォルダ ID・パスも同じ範囲指定で別配列に返す。本文を返さない |
| `uft_read_document` | `workspaceId`、`entryId` | `offset`、`limit` | Markdown の指定範囲、全長、次の offset、revision、`versionToken`。選択文書を変えない |
| `uft_open_document` | `workspaceId`、`entryId` | なし | 対象文書を選択し、結果を表示。`selectEntry` と同様に選択状態を保存。本文は返さない |
| `uft_create_document` | `workspaceId`、`name`、`content`、`requestId` | `parentId`（省略時はルート） | Markdown を作成・保存・選択し、ID・パス・revision・versionToken を返す。同名を上書きしない |
| `uft_update_document` | `workspaceId`、`entryId`、`versionToken`、`content`、`requestId` | なし | 対象本文の全体置換。保存後の revision・versionToken を返す。対象が選択中ならエディタとプレビューを更新 |

読み取り 2 ツールは `readOnlyHint: true`。文書切り替えも選択状態を保存するため `readOnlyHint: false` とする。本文やユーザー作成の名前・パスを返すツールは `untrustedContentHint: true`。本文の全体置換には UFT の判断として `consequentialHint: true` を付ける。

一覧は offset 0、limit 5 を既定とし、limit は最大 20。本文は offset 0、limit 1000 UTF-16 コード単位を既定・最大とする。これは JavaScript の文字列 index に合わせた範囲であり、ユーザー向けの文字数表示とは区別する。省略部分を `nextOffset` と `totalLength` で明示し、versionToken が変わったページの読み取り結果を連結しない。

文書とフォルダの一覧はそれぞれパス・ID 順に整列し、それぞれの次の offset を返す。本文はサロゲートペアの途中を境界にせず、実際に返した範囲と次の offset を返す。範囲外の offset は空の結果と続きなしを返す。

作成・置換の本文入力は最大 1 MiB（UTF-8）、文書名は最大 255 UTF-16 コード単位、offset は 0 以上の整数とする。上限を越える既存文書も分割して読めるが、初期の編集ツールでは更新しない。これらの値は試験で見直せるよう定数にまとめる。

名前は空白のみ、パス区切り、制御文字、`.`／`..` を拒否し、既存 UI と同様に `.md` を補う。親は現在のワークスペース内の削除されていないフォルダに限定する。文書 ID からは Markdown のみを選べる。入力スキーマは `additionalProperties: false`、必須フィールド、型、範囲を定義し、実行時にも同じ条件を検証する。

実行コールバックの返り値は JSON シリアライズ可能なオブジェクトにする。正常な本文やユーザー入力をエラーの説明へ混ぜず、エラーコードと短いメッセージを返す。

```json
{
  "ok": true,
  "data": {
    "workspaceId": "default",
    "entryId": "overview",
    "revision": 3,
    "versionToken": "opaque-version-token",
    "saved": true
  }
}
```

想定エラーは `INVALID_INPUT`、`WORKSPACE_CHANGED`、`NOT_READY`、`NOT_FOUND`、`CONFLICT`、`BUSY`、`CANCELLED`、`SAVE_FAILED`、`REQUEST_ID_REUSED`。更新の `CONFLICT` では本文を自動的に再置換せず、文書の再読み取りを案内する。API の登録エラーは登録側で捕捉し、通常編集を継続する。

## 登録とライフサイクル

`document.modelContext` の存在と `registerTool` を検出し、HTTPS／localhost の対応環境だけで Imperative API を使う。古い navigator API へのフォールバックと自動ポリフィルは初期導入に含めない。WebMCP がない場合は通常のエディタが動く。

`/workspace` で repository と workspace の初期化が完了した後に登録する。Svelte の effect はページ、初期化状態、workspace ID、利用設定だけを監視し、キー入力ごとに再登録しない。各 execute はクロージャに保持した古い workspace を使わず、最新状態を取得する getter を使う。

登録群に `AbortController` を割り当て、ページ離脱、コンポーネント破棄、ワークスペース変更、利用停止で解除する。登録途中の失敗では成功済みの登録も解除する。破棄中の非同期登録が完了してツールだけ残るケースも試験する。

実行には別のキャンセル signal を渡す。非同期処理の前後にページ・workspace ID・キャンセルを再検証する。実行中に変更されたワークスペースへ旧リクエストを書き込まない。登録解除と実行キャンセルを同一の動作と仮定しない。

## 編集・保存・競合の設計

読み取り時の `versionToken` は、対象のローカル版と永続化版の双方を表す不透明な値とする。各版には revision、updatedAt、本文の SHA-256、エントリの deletedAt を含め、ワークスペース ID と文書 ID に結び付ける。本文ハッシュにより同じ revision／時刻でも別内容を判別する。永続化されていない文書には保存版なしの状態を明示する。読み取り中にローカル版が変わったら snapshot を取り直す。

作成・編集を公開する前に、通常の保存と WebMCP の保存が同じ保存サービスを通るよう整理する。現在の `saveNow` にある「保存済み状態を読む → merge → 保存」を repository の単一 IndexedDB readwrite transaction 内へ移し、統合後の状態を返す。エージェント用には保存版の条件確認と更新を同じ transaction で行う操作を追加する。現行の `open()` は選択メタデータも更新するため、版取得用には副作用のない読み取りを追加する。

本文更新の処理順は次のとおりとする。

1. 入力、ページ、workspace ID、文書種別を確認し、同一ページ内の更新コマンドを直列化する。更新前の本文を取得して確認ダイアログに差分を表示する。
2. ユーザーが適用を選んだ後、短い保存処理の間だけ対象文書の手動編集とワークスペース切り替えを抑止する。待機中や確認中には手動編集を止めない。最新のローカル版を token と比較し、異なれば `CONFLICT` とする。
3. 保存 transaction 内で最新の永続化版を token と比較する。異なれば書き込まず `CONFLICT` とする。一致する場合は他文書の変更とローカル状態を統合し、`updateDocument` で本文を更新する。時刻は対象の既存版より新しくして timestamp merge で取り落とされないようにする。
4. transaction の `oncomplete` をもって保存成功とする。失敗時は画面へ新しい本文を確定せず、`SAVE_FAILED` を返す。成功後は最新の UI 状態と結果を統合し、対象本文、文字数、プレビュー、保存表示を更新し、BroadcastChannel へ通知する。
5. 編集抑止を解除し、保存後の token を返す。CodeMirror の履歴ではこの変更を 1 回の Undo で戻せるようにし、Undo／Redo も通常の文書更新・保存へ流す。

Web Locks を使う場合は既存の `uft-workspace-save` と揃え、ロック内から再び `saveNow` を呼んで同じロックを取り直さない。Web Locks がない環境でも、保存版の比較と書き込みは同じ IndexedDB transaction で完結させる。ハッシュは transaction 外で計算し、transaction 内では取得済み snapshot と最新の本文・revision・updatedAt・deletedAt を直接比較してから使う。transaction を開いたままダイアログや長い非同期処理を待たない。

通常保存・遅延保存・ツール保存も同一ページ内のキューへまとめる。既存の保存が終わった後に token を再検証し、処理中に遅延保存が割り込まないようにする。対象文書の同期反映は保存ガード中だけ保留し、完了後に最新状態を再取得する。ガードの解除は成功・失敗・キャンセルのいずれでも行う。

この対策で、読み取り後の同一タブの変更と、別タブですでに保存された変更に基づく古い AI 編集を拒否する。別タブでまだ保存されていない入力は検出できず、後の手動編集には既存の timestamp merge が適用される。CRDT や全タブの未保存入力まで保護する保証は初期導入に含めず、この限界を利用説明と試験結果に記載する。

作成は同じ保存経路で名前・親・重複を再検証し、`createEntry` と本文設定をまとめて保存する。成功するまで画面へ完成文書として追加しない。選択を保存する `open_document` も保存完了と結果の表示を確認する。

`requestId` は自動再試行による二重作成・二重更新を防ぐために使う。成功結果と入力の指紋を IndexedDB の既存 metadata store に、workspace ID と request ID を組にして文書と同じ transaction で保存する。同じ ID・同じ入力の再呼び出しは元の結果を返し、異なる入力には `REQUEST_ID_REUSED` を返す。保持は各ワークスペースの直近 100 件とし、保持範囲外では重複排除を保証しない。

保存済み request ID は新しい差分確認や versionToken の競合判定より先に調べ、transaction 内でも再確認する。再試行の返り値には元の結果であることを示し、その後の文書編集を取り消したり再適用したりしない。

キャンセルは書き込み前に中止し、transaction の完了前なら abort を試みる。保存完了後に届いたキャンセルで成功した変更を巻き戻さない。応答を受け取れなかった場合も、同じ request ID で保存結果を確認できるようにする。

## 利用説明と公開範囲

ワークスペース内に「AI 連携」の利用設定を設け、利用開始時に「有効にすると、このワークスペースの文書を対応 AI が読み取り・編集できます。読み取った本文は AI サービスで処理される場合があります」と説明する。既定は無効、設定はページセッション内だけ保持し、別ワークスペースでは再び無効にする。未対応環境では通常編集を使えることを表示する。

一覧や本文の読み取りにもこの利用設定を適用する。更新は、ブラウザの `consequentialHint` に加えて UFT の差分確認を必須とし、拒否・閉じる・signal のキャンセルでは更新しない。作成は利用設定の範囲内で実行し、名前と保存結果を画面に表示する。登録名・説明はアプリが定義する固定文面を使い、本文中の命令をツール説明として扱わない。

`exposedTo` は指定せず、外部 origin や iframe には公開しない。既存 CSP は緩めない。UFT にモデル呼び出しや本文を送信する通信を追加せず、ログには操作名・結果だけを記録し、本文や token を残さない。

## 実装ファイル案

| パス | 役割 |
| --- | --- |
| `src/lib/webmcp/types.ts` | 採用する API の最小型、ツールの入出力・結果型。型パッケージの採用は実装時に公式 API と照合 |
| `src/lib/webmcp/register-tools.ts` | feature detection、非同期登録、解除、登録エラー処理 |
| `src/lib/webmcp/markdown-tools.ts` | 5 ツールの説明・スキーマ・入力検証・結果の正規化 |
| `src/lib/workspace/workspace-commands.ts` | UI とツールの共通操作、最新状態の取得、確認、処理中のガード、保存結果の反映 |
| `src/lib/storage/workspace-repository.ts` | 副作用のない版取得、通常保存の transaction 内 merge、条件付き更新と再試行結果の保存 |
| `src/lib/pages/WorkspacePage.svelte` | 利用設定、登録条件、差分確認と保存表示を接続。ツール定義はこのファイルへ直接追加しない |
| `src/lib/components/CodeMirrorEditor.svelte` | 編集中ガードと外部更新の Undo／Redo を必要に応じて調整 |
| `src/lib/webmcp/*.test.ts` | スキーマ、検証、読み取り範囲、登録解除、更新条件の単体テスト |
| `src/lib/storage/workspace-repository.test.ts` | 実際の IndexedDB transaction の競合・失敗・再試行契約の検証 |
| `e2e/webmcp.spec.ts` | ページ・エディタ・プレビュー・保存・複数タブの統合試験 |
| `docs/webmcp.md`、`README.md` | 利用方法、確認環境、データ提供と競合の限界、試験公開の更新 |

## 実装順序と段階ごとの完了条件

1. **API の実機確認**: 対象 Chrome と Inspector で `document.modelContext`、登録・解除、signal、返り値を確認し、ブラウザのバージョンと日時を記録する。公式資料と実装の差分があれば薄い登録モジュールに閉じ込める。
2. **読み取りと切り替え**: 利用設定、登録モジュール、一覧・分割読み取り・文書切り替えを実装する。未対応環境、初期化失敗、ページ離脱、workspace 変更で通常編集と公開範囲が正しく動くことを確認する。
3. **保存経路の整理**: 共通操作と transaction 内保存を実装する。既存の遅延保存、別タブ同期、旧 OPFS データ取り込み、ZIP 復元を維持し、条件付き更新・失敗・再試行を検証する。
4. **作成と本文更新**: 2 つの書き込みツール、差分確認、versionToken、requestId、キャンセルを追加する。保存成功を返す時点と画面の本文・Undo を一致させる。
5. **試験公開**: 利用手順と検証結果を更新する。必要な公開 origin ごとに Origin Trial の条件と期限を再確認し、token を `<meta>` またはレスポンスヘッダーへ追加する。公開ホストと preview ホストの対象を混同せず、期限切れも通常編集へ戻ることを確認する。

WebMCP 対応だけなら CSP の外部通信先追加や Pages Functions は不要である。5 ツールの実装では既存 CSP を維持した。試験公開は、対象公開 origin とその Origin Trial トークンを確認してから行う。トークンのビルド時設定とフラグなしの公開検証用テストは追加済みで、実サイトの検証結果はまだない。

## 検証計画

| 層 | 検証する挙動 |
| --- | --- |
| 単体 | 入力の型・余分なフィールド・上限、削除済み／別 workspace／図表 ID の拒否、ページング、返り値の JSON 化、同 revision の別本文、token の対象不一致 |
| 登録 | API なし、無効設定、登録一部失敗、破棄と登録完了の競合、解除後の再入場、workspace 変更、キー入力で再登録しないこと |
| 永続化 | 古い保存版の拒否、transaction の abort、失敗時に成功を返さない、Web Locks なし、通常保存とツール保存の競合、同 request ID の再試行と異なる入力の拒否 |
| UI 統合 | 作成・更新の表示、プレビューと文字数、1 回の Undo と Redo、差分確認の承認／拒否、確認中の手動編集、編集対象以外の文書を巻き戻さないこと |
| 複数タブ | 保存済みの同一文書の競合、同 revision／時刻でも本文が異なる競合、別文書の変更保持、更新中の同期、未保存の別タブ入力に対する保証の限界 |
| キャンセル | 確認中、保存前、保存中、保存完了後、離脱、workspace 変更。保存完了後の変更を取り消したと報告しないこと |
| 実ブラウザ | フラグ有効な Chrome と Inspector、Origin Trial 有効／無効／期限切れの対応環境、通常の未対応ブラウザ |

CI では登録 API のモックを用いたテストと UI・IndexedDB の統合試験を行う。モックだけで WebMCP の実対応を証明しない。ネイティブ API の検証は実ブラウザでも行い、ヘッドレスで利用できない場合はその制約を記録する。

実装 PR では `pnpm lint`、`pnpm check`、`pnpm test`、`pnpm build`、`pnpm test:e2e` を実行する。既存の選択範囲、手動編集、複数タブ同期、Markdown／ZIP 出力、変換画面の回帰も確認する。実装の検証コマンド、実ブラウザのバージョン、Inspector の結果は検証記録へ記載する。

## 初期導入の受け入れ条件

- 5 ツールが有効な `/workspace` でのみ使え、無効化・離脱・workspace 変更で旧ツールが残らない。
- 未対応ブラウザ、無効な Origin Trial、登録失敗でも通常の Markdown 編集・保存を続けられる。
- 一覧と読み取りが対象の範囲を守り、長文を欠落表示なしに分割取得できる。
- 作成・更新の成功応答後に再読み込みしても同じ内容が残り、失敗・拒否時は確定本文を変えない。
- 同一タブの変更と、保存済みの別タブの変更に対する古い AI 更新を拒否し、別文書の変更を保持する。
- 更新差分を確認でき、適用後のエディタ・プレビュー・文字数・保存表示が一致し、Undo／Redo が動く。
- 再試行の保持範囲内で文書の二重作成・二重更新を防ぎ、キャンセル後の永続化状態を正しく伝える。
- 読み取り時の AI へのデータ提供と、別タブの未保存入力に対する限界を利用者へ説明する。
- 必須チェック、既存回帰試験、Inspector と実ブラウザによる検証結果を実装 PR に添付する。
