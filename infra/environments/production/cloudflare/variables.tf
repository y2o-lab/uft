variable "cloudflare_account_id" {
  type        = string
  default     = null
  nullable    = true
  description = "Cloudflare account ID that owns the Pages project and zone. Set via terraform.tfvars or TF_VAR_cloudflare_account_id."
}

variable "domain_name" {
  type        = string
  default     = "example.com"
  description = "Apex domain to manage in Cloudflare. Replace the safe example before applying."
}

variable "manage_zone" {
  type        = bool
  default     = false
  description = "Create the Cloudflare zone when true. Keep false when the domain is already an active Cloudflare zone."
}

variable "zone_type" {
  type        = string
  default     = "full"
  description = "Cloudflare zone type used only when manage_zone is true."
}

variable "pages_project_name" {
  type        = string
  default     = "uft"
  description = "Cloudflare Pages project name."
}

variable "production_branch" {
  type        = string
  default     = "release"
  description = "Git branch promoted to the production Pages deployment by GitHub Actions."
}

variable "build_command" {
  type        = string
  default     = "pnpm build"
  description = "Build command stored on the Pages project for visibility and future Pages build compatibility."
}

variable "build_output_directory" {
  type        = string
  default     = "dist"
  description = "Directory produced by the static-site build."
}

variable "additional_custom_domains" {
  type        = set(string)
  default     = []
  description = "Additional hostnames, such as www.example.com, to attach to the Pages project."
}
