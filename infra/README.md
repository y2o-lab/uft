# Infrastructure

This directory keeps infrastructure isolated by provider. Adding another provider later (for example, `infra/aws` or `infra/vercel`) does not require restructuring the Cloudflare configuration.

| Directory | Responsibility |
| --- | --- |
| `cloudflare/` | Cloudflare zone, Pages project, and custom domains |

Each provider directory is an independent Terraform root module with its own state. Do not share a Terraform state file across providers.
