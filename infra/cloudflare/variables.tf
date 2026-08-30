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

  validation {
    condition     = can(regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", var.domain_name))
    error_message = "domain_name must be a valid DNS domain name without a protocol or path."
  }
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

  validation {
    condition     = contains(["full", "partial", "secondary"], var.zone_type)
    error_message = "zone_type must be full, partial, or secondary."
  }
}

variable "pages_project_name" {
  type        = string
  default     = "uft"
  description = "Cloudflare Pages project name."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$|^[a-z0-9]$", var.pages_project_name))
    error_message = "pages_project_name must use lowercase letters, numbers, and hyphens and be at most 59 characters."
  }
}

variable "production_branch" {
  type        = string
  default     = "main"
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

  validation {
    condition = alltrue([
      for domain in var.additional_custom_domains :
      can(regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", domain))
    ])
    error_message = "additional_custom_domains entries must be valid DNS domain names."
  }
}
