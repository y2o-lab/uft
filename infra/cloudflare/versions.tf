terraform {
  required_version = ">= 1.8.0, < 2.0.0"

  # HCP Terraform provides durable, locked state for local and CI runs. Its
  # organization and workspace are supplied from the ignored backend.hcl file
  # locally and from GitHub Actions variables in CI.
  backend "remote" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.19.0, < 6.0.0"
    }
  }
}
