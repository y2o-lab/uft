# ADR 0002: 図表キャンバスと AWS アイコン

- Status: Accepted
- Date: 2026-09-09

## Context

既存の図表機能は `@xyflow/svelte` を使っていたものの、既定ノードの接続点と独自 SVG 出力が右から左への一方向直線に固定されていた。フローの分岐・戻り線・双方向線に加えて、システムアーキテクチャ図と AWS 公式アイコンを使うインフラ構成図が必要になった。

調査では、保守頻度、Svelte 5 との親和性、ライセンス、オフライン動作、既存の保存形式への適合性を比較した。

| 候補 | 保守・信頼性 | ライセンス / 適合性 | 判断 |
| --- | --- | --- | --- |
| [Svelte Flow](https://github.com/xyflow/xyflow) | 36k stars 規模の xyflow 本体で継続開発され、2026年にも複数リリース。四辺ハンドル、Loose 接続、複数経路、MiniMap を公式 API として提供 | MIT。既存採用済みで、Svelte のまま段階拡張できる | 採用継続 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 活発で、フローや SVG 出力も充実 | MIT だが React 本体とフォント資産を追加する全面置換になる。構造化したサービスノード編集より自由描画寄り | 不採用 |
| [draw.io](https://github.com/jgraph/drawio) | 非常に活発で機能・ステンシルが豊富 | Apache-2.0。ただしアプリ全体の埋め込みになり、現在のローカル保存モデルと UI を大きく二重化する | 不採用 |
| [tldraw](https://github.com/tldraw/tldraw) | 活発でモダン | 現行 SDK は OSS ではなく、本番利用にライセンスキーが必要。React ベース | 不採用 |

AWS は[公式アーキテクチャアイコン](https://aws.amazon.com/architecture/icons/)を構成図向けに提供し、年3回更新している。個別 SVG の利用には、公式配布物を SVG と typed metadata にした [`@aws-icons/svg`](https://www.npmjs.com/package/@aws-icons/svg) 4.1.1 を固定バージョンで使う。同パッケージは MIT、ゼロ依存で、調査時点の直近1か月以内に更新されている。アイコン自体の著作権と利用条件は AWS の条件に従う。

## Decision

1. `@xyflow/svelte` のカスタムノードと `ConnectionMode.Loose` を使い、全ノードの上下左右に接続点を持たせる。
2. ノードは処理、判断、開始/終了、コンポーネント、データベース、キュー、注釈、AWSサービスを用意する。
3. エッジは曲線、角丸直交、直交、直線とし、片方向、双方向、矢印なし、および実線、破線、ラベルを保存する。
4. フロー、汎用アーキテクチャ、AWS Web、AWS サーバーレス、ER のテンプレートを提供する。
5. AWS はよく使う12サービスのみを静的 import し、外部 CDN やネットワークを必要としない。SVG 出力にはパス参照ではなくアイコンの SVG 本体を埋め込む。
6. SVG の経路計算には Svelte Flow が再公開する `getBezierPath`、`getSmoothStepPath`、`getStraightPath` を使い、キャンバスとエクスポートの見た目を揃える。
7. 旧図表は読み込み時に通常の処理ノードへ補完し、位置関係から自然な接続辺を推定する。保存形式の `formatVersion` は加法的な省略可能フィールドだけで拡張する。

## Consequences

- 現在のワークスペース、ZIP、Markdown への SVG 挿入を変えずに表現力を増やせる。
- SVG はアイコンを自己完結で保持するため、オフライン表示とバックアップ復元後の表示が維持される。
- AWS アイコンの追加や更新ではパッケージ更新だけでなく、公式のアイコン利用条件、名称、生成 SVG の埋め込みテストを確認する。
- 自由描画や共同編集が主目的になった場合は Excalidraw 等を別機能として再評価する。
