# Infrastructure

Terraform is organized by the boundary it represents:

| Directory | Responsibility |
| --- | --- |
| `modules/` | Reusable, provider-specific Terraform modules. Modules never configure state or credentials. |
| `environments/` | Deployable root modules. Each root configures its own state, provider requirements, and values for one environment. |

The current production entry point is
`environments/production/cloudflare`. It instantiates the
`modules/cloudflare-pages-site` module to manage the Cloudflare zone, Pages
project, custom domains, and Web Analytics site.

Do not share a Terraform state file across environments or providers. Add a
new deployment target as an independent root module, for example
`environments/staging/cloudflare` or `environments/production/aws`; reuse a
module only when its lifecycle and inputs genuinely match.
