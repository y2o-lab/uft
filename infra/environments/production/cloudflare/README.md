# Production Cloudflare infrastructure

This is the deployable production root module. Its `backend.tf` configures an
R2-backed Terraform state backend, and it instantiates
`../../../modules/cloudflare-pages-site`.

## What Terraform manages

- The existing `yuno-i.com` Cloudflare zone by default, or a new zone when `manage_zone = true`.
- The `uft` Cloudflare Pages project, configured with `pnpm build` and `dist`.
- The `uft.yuno-i.com` custom domain, its proxied CNAME record, and any optional additional custom domains on that Pages project.
- A Web Analytics site for the configured domain, attached to the Pages project.

The project is a static, local-first SPA with no server-side application code
or data store, so Cloudflare Pages is preferable to a Worker. Deployments are
uploaded directly by GitHub Actions; the Pages project is intentionally not
connected to Cloudflare's Git integration.

Terraform associates a hostname with Pages and then manages its proxied CNAME
record in the `yuno-i.com` zone. Do not manually create or edit a competing DNS
record for any hostname declared here.

## One-time setup

1. Register the domain with a registrar, then add it to Cloudflare. Set its registrar nameservers to the nameservers Cloudflare assigns. Domain registration and registrar-side nameserver delegation cannot be automated by this Terraform configuration.
2. Create a scoped Cloudflare API token with **Account / Pages: Edit**, **Account / Account Settings: Edit**, **Zone / Zone: Read**, and **Zone / DNS: Edit** permissions. Restrict the zone permissions to `yuno-i.com`. Add **Zone / Zone: Edit** only when `manage_zone = true`. Store only the token as `CLOUDFLARE_API_TOKEN`; never put it in a `.tf` file or tfvars file.
3. `variables.tf` separates the Cloudflare zone from the Pages hostname: `zone_name` is the existing `yuno-i.com` zone and `domain_name` is the `uft.yuno-i.com` Pages hostname. Keep `manage_zone = false` so Terraform reads the existing zone, associates the Pages custom domain, and creates its CNAME record in one apply. For a new zone, set `manage_zone` to `true`, apply once, and complete nameserver delegation at the registrar.
4. Create the dedicated R2 bucket and the `backend.tf` S3 backend configuration. Do not put `access_key` or `secret_key` in `backend.tf`; use the standard `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables instead. Configure the R2 endpoint, bucket, state key, `region = "auto"`, and the S3 compatibility flags required by R2. Cloudflare's [R2 backend guide](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/) lists the required flags.
5. Create an R2 S3 API token scoped to that bucket with **Object Read & Write** access. This is separate from `CLOUDFLARE_API_TOKEN`; save its Access Key ID and Secret Access Key only in your local environment and GitHub Actions secrets.

## Local commands

```bash
cd infra/environments/production/cloudflare
export CLOUDFLARE_API_TOKEN='…' # enter locally; do not save it in shell history
export AWS_ACCESS_KEY_ID='…'
export AWS_SECRET_ACCESS_KEY='…'
terraform init
terraform plan
terraform apply
```

After the first provision, build and upload the static site with `pnpm pages:deploy`, or let the deployment workflow handle it. Deploy once more after applying this configuration so Pages can inject the Web Analytics beacon; metrics can take a few minutes to appear in the Cloudflare dashboard.

If a Pages project or custom domain already exists, import it before the first
apply so Terraform adopts it instead of attempting to create a duplicate:

```bash
terraform import module.site.cloudflare_pages_project.site "$CLOUDFLARE_ACCOUNT_ID/$PAGES_PROJECT_NAME"
terraform import 'module.site.cloudflare_pages_domain.site["example.com"]' "$CLOUDFLARE_ACCOUNT_ID/$PAGES_PROJECT_NAME/example.com"
terraform import 'module.site.cloudflare_dns_record.pages["example.com"]' "$CLOUDFLARE_ZONE_ID/$DNS_RECORD_ID"
```

## State migration from the previous layout

This root replaces the former `infra/cloudflare` entry point. The `moved`
blocks in `main.tf` migrate the managed resource addresses into `module.site`;
run `terraform plan` before the first apply and confirm that the plan reports
moves rather than replacement. Do not use the former directory after this
change.

If an HCP Terraform state already exists, migrate it to R2 from a machine that
can still authenticate to HCP Terraform by running `terraform init -migrate-state`
after adding `backend.tf`. Use the R2 backend for every subsequent local and CI
run.

## GitHub Actions configuration

Terraform reads non-secret infrastructure values from the defaults in
`variables.tf`; it does not receive them through `TF_VAR_*`. GitHub Actions
uses R2 S3 credentials only to initialize the backend, and uses a separate
Cloudflare API token to manage and deploy Cloudflare resources.

| GitHub setting | Kind | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Cloudflare account ID for the Pages deployment CLI |
| `CLOUDFLARE_API_TOKEN` | Secret | Scoped Cloudflare API token |
| `R2_ACCESS_KEY_ID` | Secret | Access Key ID for the bucket-scoped R2 S3 API token |
| `R2_SECRET_ACCESS_KEY` | Secret | Secret Access Key for the bucket-scoped R2 S3 API token |

Protect the `production` GitHub Environment with required reviewers. Terraform plans run for pull requests targeting `release-infra`, and Terraform applies after they merge into `release-infra`. The Pages deployment runs after an application change merges into `release`. Both apply and deployment jobs use the protected environment.
