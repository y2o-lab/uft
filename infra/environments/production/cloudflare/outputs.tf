output "pages_project_name" {
  description = "Cloudflare Pages project name."
  value       = module.site.pages_project_name
}

output "pages_subdomain" {
  description = "Default pages.dev hostname assigned by Cloudflare."
  value       = module.site.pages_subdomain
}

output "custom_domains" {
  description = "Custom hostnames attached to the Pages project."
  value       = module.site.custom_domains
}

output "zone_id" {
  description = "ID of the created or existing Cloudflare zone."
  value       = module.site.zone_id
}
