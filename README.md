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
