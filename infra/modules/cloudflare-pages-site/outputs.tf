output "pages_project_name" {
  description = "Cloudflare Pages project name."
  value       = cloudflare_pages_project.site.name
}

output "pages_subdomain" {
  description = "Default pages.dev hostname assigned by Cloudflare."
  value       = cloudflare_pages_project.site.subdomain
}

output "custom_domains" {
  description = "Custom hostnames attached to the Pages project."
  value       = sort(tolist(local.custom_domains))
}

output "zone_id" {
  description = "ID of the created or existing Cloudflare zone."
  value       = local.zone_id
}
