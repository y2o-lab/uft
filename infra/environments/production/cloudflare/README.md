# Production Cloudflare infrastructure

This is the deployable production root module. It configures the HCP Terraform
state backend and Cloudflare provider, then instantiates
`../../../modules/cloudflare-pages-site`.

## What Terraform manages

- An existing Cloudflare zone by default, or a new zone when `manage_zone = true`.
- The `uft` Cloudflare Pages project, configured with `pnpm build` and `dist`.
- The apex domain and any optional additional custom domains on that Pages project.
- A Web Analytics site for the configured domain, attached to the Pages project.

The project is a static, local-first SPA with no server-side application code
or data store, so Cloudflare Pages is preferable to a Worker. Deployments are
uploaded directly by GitHub Actions; the Pages project is intentionally not
connected to Cloudflare's Git integration.

When adding a custom domain to a Pages project, Cloudflare Pages owns the
required DNS mapping. Do not add a separate CNAME for the same hostname.

## One-time setup

1. Register the domain with a registrar, then add it to Cloudflare. Set its registrar nameservers to the nameservers Cloudflare assigns. Domain registration and registrar-side nameserver delegation cannot be automated by this Terraform configuration.
2. Create a scoped Cloudflare API token with **Account / Pages: Edit**, **Account / Account Settings: Edit**, and **Zone / Zone: Read** permissions. Add **Zone / Zone: Edit** when `manage_zone = true`. Store only the token as `CLOUDFLARE_API_TOKEN`; never put it in a `.tf` file or tfvars file.
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and replace the example account ID and domain. Use `manage_zone = false` for an already active Cloudflare zone. For a new zone, set it to `true`, apply once, and complete nameserver delegation at the registrar.
4. Use remote state before applying from CI. Copy `backend.hcl.example` to the ignored `backend.hcl`, set the HCP Terraform organization and workspace, and authenticate with `TF_TOKEN_app_terraform_io` locally. HCP Terraform's workspace provides state locking and a durable audit trail.

## Local commands

```bash
cd infra/environments/production/cloudflare
export CLOUDFLARE_API_TOKEN='…' # enter locally; do not save it in shell history
export TF_TOKEN_app_terraform_io='…'
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

After the first provision, build and upload the static site with `pnpm pages:deploy`, or let the deployment workflow handle it. Deploy once more after applying this configuration so Pages can inject the Web Analytics beacon; metrics can take a few minutes to appear in the Cloudflare dashboard.

If a Pages project or custom domain already exists, import it before the first
apply so Terraform adopts it instead of attempting to create a duplicate:

```bash
terraform import module.site.cloudflare_pages_project.site "$CLOUDFLARE_ACCOUNT_ID/$PAGES_PROJECT_NAME"
terraform import 'module.site.cloudflare_pages_domain.site["example.com"]' "$CLOUDFLARE_ACCOUNT_ID/$PAGES_PROJECT_NAME/example.com"
```

## State migration from the previous layout

This root replaces the former `infra/cloudflare` entry point while retaining
the same HCP Terraform workspace. The `moved` blocks in `main.tf` migrate the
managed resource addresses into `module.site`; run `terraform plan` before the
first apply and confirm that the plan reports moves rather than replacement.
Do not use the former directory after this change.

## GitHub Actions configuration

The workflows use GitHub Actions variables for non-secret, account-specific values and secrets only for credentials.

| GitHub setting | Kind | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Cloudflare account ID |
| `CLOUDFLARE_DOMAIN_NAME` | Variable | Apex domain |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Variable | Pages project name; defaults to `uft` in Terraform and deployment workflow |
| `TF_CLOUD_ORGANIZATION` | Variable | HCP Terraform organization |
| `TF_CLOUD_WORKSPACE` | Variable | HCP Terraform workspace |
| `CLOUDFLARE_API_TOKEN` | Secret | Scoped Cloudflare API token |
| `TF_API_TOKEN` | Secret | HCP Terraform user or team token |

Protect the `production` GitHub Environment with required reviewers. Terraform plans run for pull requests targeting `release-infra`, and Terraform applies after they merge into `release-infra`. The Pages deployment runs after an application change merges into `release`. Both apply and deployment jobs use the protected environment.
