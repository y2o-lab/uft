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
  value       = var.manage_zone ? cloudflare_zone.site[0].id : data.cloudflare_zone.site[0].id
}
