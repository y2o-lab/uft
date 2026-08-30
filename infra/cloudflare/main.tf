locals {
  custom_domains = setunion(toset([var.domain_name]), var.additional_custom_domains)
}

# A zone can be created here for a newly registered domain. Its assigned
# nameservers must then be delegated at the registrar before it becomes active.
resource "cloudflare_zone" "site" {
  count = var.manage_zone ? 1 : 0

  account = {
    id = var.cloudflare_account_id
  }
  name = var.domain_name
  type = var.zone_type

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = var.cloudflare_account_id != null && length(trimspace(var.cloudflare_account_id)) == 32
      error_message = "Set cloudflare_account_id to the 32-character Cloudflare account ID before planning or applying."
    }

    precondition {
      condition     = var.domain_name != "example.com"
      error_message = "Replace the example domain_name with the domain managed by your Cloudflare account before planning or applying."
    }
  }
}

# Most domains will already be active in Cloudflare. Reading rather than
# recreating that zone avoids replacing an established DNS configuration.
data "cloudflare_zone" "site" {
  count = var.manage_zone ? 0 : 1

  filter = {
    name = var.domain_name
    account = {
      id = var.cloudflare_account_id
    }
  }
}

resource "cloudflare_pages_project" "site" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.production_branch

  build_config = {
    build_caching   = true
    build_command   = var.build_command
    destination_dir = var.build_output_directory
    root_dir        = "/"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Pages creates the necessary Cloudflare DNS mapping for a hostname in the
# managed zone. Do not create a competing CNAME record for these hostnames.
resource "cloudflare_pages_domain" "site" {
  for_each = local.custom_domains

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  name         = each.value

  depends_on = [cloudflare_zone.site]
}
