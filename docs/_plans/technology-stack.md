# 技術スタック決定

> 状態: ADR 0001 で承認済み  
> 参照: [ADR 0001](../adr/0001-local-first-editor-stack.md)

## プロダクト境界

UFT は、Markdown と図表をローカルで作成し、Markdown・PDF・ZIP として出力するブラウザアプリケーションである。

- ログインなし
- サーバー側のユーザーデータ保存なし
- Cloudflare Pages に静的配信
- 文書、画像、図表はユーザーのブラウザ内に保存
- 共有・同期・共同編集は初期スコープ外

## 確定スタック

```text
Svelte 5 + TypeScript + Vite
  ├─ Bun                    開発・依存関係・ビルド・テスト
  ├─ Cloudflare Pages       静的配信
  ├─ CodeMirror 6           Markdown 編集
  ├─ Unified / Mermaid      Markdown プレビューと図表表示
  ├─ Svelte Flow            GUI 図表エディタ
  ├─ SQLite WASM + OPFS     ローカルワークスペース
  ├─ fflate                 ZIP の入出力
  └─ print CSS              PDF 保存
```

## 責務分割

| レイヤー | 責務 | 保存先 |
| --- | --- | --- |
| Svelte UI | エディタ、プレビュー、エクスプローラー、コマンドパレット | メモリ上の UI 状態 |
| DB Worker | SQLite クエリ、マイグレーション、保存キュー | OPFS 上の SQLite DB |
| Asset store | 画像、SVG、PNG、図表プレビュー | OPFS |
| Export service | Markdown、PDF、ZIP の生成 | ユーザーのダウンロード先 |
| Cloudflare Pages | アプリケーションの静的アセット配信 | Cloudflare CDN |

## ワークスペースの論理構造

```text
workspace
├── docs/
│   ├── overview.md
│   └── authentication.md
├── assets/
│   ├── login-screen.png
│   └── diagrams/
│       └── authentication-flow.svg
└── diagrams/
    └── authentication-flow.uft.json
```

SQLite はパス、階層、Markdown、アセットメタデータ、図表メタデータを管理する。アセットのバイナリ本体は OPFS に保持する。上記構造は ZIP エクスポート時に実ファイルとして生成する。

## 遅延ロード方針

初期ロードを小さく保つため、次の機能は必要になるまで読み込まない。

- Mermaid: Mermaid ブロックを含む文書をプレビューするとき
- Svelte Flow: 図表を新規作成・編集するとき
- SQLite WASM: 最初のワークスペースを開くとき（初期 UI 描画後）
- ZIP 処理: インポートまたはエクスポートするとき
- PDF 用の追加処理: PDF 出力を選んだとき

## 初期リリースの出力仕様

| 出力 | 内容 | 目的 |
| --- | --- | --- |
| `.md` | 単一 Markdown 文書。アセットは相対パスで参照する | テキストとしての共有 |
| `.zip` | `docs/`、`assets/`、`diagrams/` を含むワークスペース | 完全なバックアップと再編集 |
| `.pdf` | print CSS で整形したプレビュー | レビュー・配布 |

GUI 図表は既定で SVG として `assets/diagrams/` に出力する。Mermaid として失われずに表現できる図のみ、Mermaid コードブロックの出力を選択可能にする。

## 実装フェーズへの前提

1. 現在の React プロトタイプは Svelte 5/Vite に移植する。
2. 先にワークスペース永続化・ZIP 入出力を完成させ、ブラウザデータ消去に備える。
3. 次に CodeMirror と Markdown プレビューを実装する。
4. 図表 GUI と Mermaid/SVG 出力を追加する。
5. 最後に PDF 出力、PWA、E2E テスト、Cloudflare Pages 配置を行う。

## スコープ外

- 認証、アカウント、クラウド同期
- 複数ユーザーの共同編集
- サーバーサイドの文書保存
- 任意の Mermaid 構文の完全な GUI 往復変換
- draw.io の iframe 埋め込み
