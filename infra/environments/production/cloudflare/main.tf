module "site" {
  source = "../../../modules/cloudflare-pages-site"

  cloudflare_account_id     = var.cloudflare_account_id
  domain_name               = var.domain_name
  manage_zone               = var.manage_zone
  zone_type                 = var.zone_type
  pages_project_name        = var.pages_project_name
  production_branch         = var.production_branch
  build_command             = var.build_command
  build_output_directory    = var.build_output_directory
  additional_custom_domains = var.additional_custom_domains
}

# The original root lived at infra/cloudflare. Keep these declarations so an
# existing HCP Terraform workspace updates its state addresses without trying
# to recreate the production resources after this module extraction.
moved {
  from = cloudflare_zone.site
  to   = module.site.cloudflare_zone.site
}

moved {
  from = cloudflare_pages_project.site
  to   = module.site.cloudflare_pages_project.site
}

moved {
  from = cloudflare_web_analytics_site.site
  to   = module.site.cloudflare_web_analytics_site.site
}

moved {
  from = cloudflare_pages_domain.site
  to   = module.site.cloudflare_pages_domain.site
}
