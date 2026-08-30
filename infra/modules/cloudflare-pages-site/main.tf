locals {
  custom_domains = setunion(toset([var.domain_name]), var.additional_custom_domains)
  zone_id        = var.manage_zone ? cloudflare_zone.site[0].id : data.cloudflare_zone.site[0].id
}

# A zone can be created here for a newly registered domain. Its assigned
# nameservers must then be delegated at the registrar before it becomes active.
# Keep this distinct from the Pages hostname: the hostname may be a subdomain
# in an existing parent zone.
resource "cloudflare_zone" "site" {
  count = var.manage_zone ? 1 : 0

  account = {
    id = var.cloudflare_account_id
  }
  name = var.zone_name
  type = var.zone_type

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = var.cloudflare_account_id != null && length(trimspace(var.cloudflare_account_id)) == 32
      error_message = "Set cloudflare_account_id to the 32-character Cloudflare account ID before planning or applying."
    }

    precondition {
      condition     = var.zone_name != "example.com"
      error_message = "Replace the example zone_name with the zone managed by your Cloudflare account before planning or applying."
    }
  }
}

# Most domains will already be active in Cloudflare. Reading rather than
# recreating that zone avoids replacing an established DNS configuration.
data "cloudflare_zone" "site" {
  count = var.manage_zone ? 0 : 1

  filter = {
    name = var.zone_name
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
    build_caching       = true
    build_command       = var.build_command
    destination_dir     = var.build_output_directory
    root_dir            = "/"
    web_analytics_tag   = cloudflare_web_analytics_site.site.site_tag
    web_analytics_token = cloudflare_web_analytics_site.site.site_token
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Pages injects the beacon during deployment using this site's tag and token.
# Keep auto_install disabled so Pages is the sole injector; enabling both would
# render two beacons on the same response.
resource "cloudflare_web_analytics_site" "site" {
  account_id   = var.cloudflare_account_id
  host         = var.domain_name
  auto_install = false
}

# Associate the hostname with Pages before creating its DNS record. A standalone
# CNAME to a Pages project does not activate the Pages custom domain.
resource "cloudflare_pages_domain" "site" {
  for_each = local.custom_domains

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  name         = each.value

  depends_on = [cloudflare_zone.site]
}

# Manage the CNAME records in Terraform so the initial apply configures both
# the Pages custom domain and its DNS mapping without dashboard changes.
resource "cloudflare_dns_record" "pages" {
  for_each = local.custom_domains

  zone_id = local.zone_id
  name    = each.value
  type    = "CNAME"
  content = cloudflare_pages_project.site.subdomain
  proxied = true
  ttl     = 1

  depends_on = [cloudflare_pages_domain.site]

  lifecycle {
    precondition {
      condition = alltrue([
        for domain in local.custom_domains :
        domain == var.zone_name || endswith(domain, ".${var.zone_name}")
      ])
      error_message = "domain_name and additional_custom_domains must be the zone_name or a subdomain of it when Terraform manages their DNS records."
    }
  }
}
