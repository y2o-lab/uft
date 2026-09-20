# Renovate の導入と運用

このリポジトリでは、GitHub.com 向けのホスト版 Mend Renovate App を使って依存関係を更新する。セルフホスト用のトークンや定期実行ワークフローは不要である。

リポジトリ設定はルートの [`renovate.json`](../renovate.json) に置く。Renovate の公式 JSON Schema を参照しているため、対応するエディターでは入力補完と基本的な検証も利用できる。

## 更新方針

| 対象 | Renovate manager | 方針 |
| --- | --- | --- |
| `package.json` / `pnpm-lock.yaml` / `packageManager` | `npm` | 1.0 以上の minor/patch はまとめ、必須 CI 成功後に自動マージ |
| `packageManager` と workflow の pnpm バージョン | `npm` / `github-actions` | 同じ PR にまとめて手動レビューし、バージョンのずれを防止 |
| npm の major | `npm` | Dependency Dashboard で承認後、個別に手動レビュー |
| 0.x の npm パッケージ | `npm` | SemVer 上 minor でも破壊的変更があり得るため、Dashboard で承認後に手動レビュー |
| `.github/workflows/*.yml` の Action と対応する `with` のツールバージョン | `github-actions` | まとめて手動レビュー |
| `*.tf` と `.terraform.lock.hcl` | `terraform` | まとめて手動レビューし、plan の内容も確認 |

- Renovate がブランチを作る時間帯は、Asia/Tokyo の毎週土曜日 08:00–11:59 に限定する。これは Renovate 自体の実行時刻を予約する設定ではなく、その時間帯に実行された場合だけブランチ作成を許可する設定である。
- 同時に開く PR とブランチは最大 3 件にする。
- `config:best-practices` により Dependency Dashboard、npm リリースの待機期間、GitHub Actions の commit digest 固定、週次 lockfile maintenance など Renovate 公式の推奨設定を利用する。
- 安定版 npm の minor/patch だけを自動マージする。ただし pnpm toolchain は workflow と揃える必要があるため手動レビューにする。GitHub Actions と Terraform も、更新種別にかかわらず自動マージしない。

## 初回設定

以下はリポジトリ管理者が一度だけ行う。

### 1. 設定ファイルを `main` に入れる

このファイルと `renovate.json` をレビューし、通常の Pull Request で `main` にマージする。Renovate App を先にインストールした場合は Configure Renovate PR が作られるが、リポジトリ側で用意した設定を使うなら、その PR をマージする代わりに本設定を `main` に入れてよい。

### 2. `main` の必須チェックを設定する

`renovate.json` は GitHub のネイティブ auto-merge を使う。必須チェックがない状態では、GitHub がテスト開始前や失敗時にマージする可能性があるため、Renovate App を有効化する前に保護する。

1. GitHub の **Settings → Rules → Rulesets → New branch ruleset** を開く。
2. 対象ブランチを `main` にする。
3. **Require a pull request before merging** を有効にする。Renovate の自動マージに人の承認を必須としない場合、Required approvals は `0` にする。
4. **Require status checks to pass** を有効にし、少なくとも `Lint, type check, test, and build` を必須にする。
5. **Require branches to be up to date before merging** も有効にする。
6. Ruleset を Active で保存する。

チェック名が候補に出ない場合は、一度通常の Pull Request で `.github/workflows/pr-validation.yml` を完走させてから再度選択する。

### 3. GitHub の auto-merge を有効にする

GitHub の **Settings → General → Pull Requests** で **Allow auto-merge** を有効にする。リポジトリで許可する merge method は squash merge を推奨する。

### 4. Renovate App をインストールする

1. [Mend Renovate App](https://github.com/apps/renovate) を開き、**Install** を選ぶ。
2. 所有者として `y2o-lab` を選ぶ。
3. **Only select repositories** で `uft` を選び、インストールする。

設定ファイルが `main` に存在すれば、Renovate は次回実行時からその設定を利用する。通常は Dependency Dashboard issue が作成され、許可された時間帯に更新 PR が作られる。数時間たってもオンボーディングが始まらない場合は、App の Configure 画面で `uft` が選択されているか確認する。

## 動作確認

ローカルでは Renovate 公式 validator で構文と廃止設定を確認する。

```bash
npx --yes --package renovate -- renovate-config-validator --strict
```

GitHub 側では次を確認する。

1. `Dependency Dashboard` issue が作られる。
2. major と 0.x の更新は Dashboard のチェックボックスを選ぶまで PR にならない。
3. npm 1.0 以上の minor/patch PR で `Lint, type check, test, and build` が成功した後だけ auto-merge される。
4. GitHub Actions と Terraform の PR は自動マージされない。

設定変更を Renovate App 自体に検証させる場合は、`renovate/reconfigure` ブランチから Pull Request を作る。App はそのブランチ名を検知し、設定の検証結果と変更後の挙動を PR に報告する。

## 日常運用

- major または 0.x を更新するときは、Dependency Dashboard の対象チェックボックスを選び、作成された PR の changelog と破壊的変更を確認する。
- Terraform provider の更新は `.terraform.lock.hcl` も含めてレビューし、`terraform plan` の差分を確認してからマージする。
- 更新 PR を再作成したい場合は、Dependency Dashboard の rebase/retry 用チェックボックスを使う。
- 設定を変えたら validator を再実行し、自動マージ対象が広がっていないか確認する。

## 参考資料

- [Installing & Onboarding](https://docs.renovatebot.com/getting-started/installing-onboarding/)
- [Upgrade best practices](https://docs.renovatebot.com/upgrade-best-practices/)
- [Managers](https://docs.renovatebot.com/modules/manager/)
- [Configuration Options](https://docs.renovatebot.com/configuration-options/)
- [Config Validation](https://docs.renovatebot.com/config-validation/)
