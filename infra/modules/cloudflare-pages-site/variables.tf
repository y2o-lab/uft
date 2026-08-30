variable "cloudflare_account_id" {
  type        = string
  nullable    = true
  description = "Cloudflare account ID that owns the Pages project and zone."
}

variable "zone_name" {
  type        = string
  description = "Existing or newly created Cloudflare zone that owns the Pages custom-domain hostname."

  validation {
    condition     = can(regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", var.zone_name))
    error_message = "zone_name must be a valid DNS domain name without a protocol or path."
  }
}

variable "domain_name" {
  type        = string
  description = "Hostname to attach to the Cloudflare Pages project and use for Web Analytics."

  validation {
    condition     = can(regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", var.domain_name))
    error_message = "domain_name must be a valid DNS domain name without a protocol or path."
  }
}

variable "manage_zone" {
  type        = bool
  description = "Create the Cloudflare zone when true. Keep false when the domain is already an active Cloudflare zone."
}

variable "zone_type" {
  type        = string
  description = "Cloudflare zone type used only when manage_zone is true."

  validation {
    condition     = contains(["full", "partial", "secondary"], var.zone_type)
    error_message = "zone_type must be full, partial, or secondary."
  }
}

variable "pages_project_name" {
  type        = string
  description = "Cloudflare Pages project name."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$|^[a-z0-9]$", var.pages_project_name))
    error_message = "pages_project_name must use lowercase letters, numbers, and hyphens and be at most 59 characters."
  }
}

variable "production_branch" {
  type        = string
  description = "Git branch promoted to the production Pages deployment by GitHub Actions."
}

variable "build_command" {
  type        = string
  description = "Build command stored on the Pages project for visibility and future Pages build compatibility."
}

variable "build_output_directory" {
  type        = string
  description = "Directory produced by the static-site build."
}

variable "additional_custom_domains" {
  type        = set(string)
  description = "Additional hostnames, such as www.example.com, to attach to the Pages project."

  validation {
    condition = alltrue([
      for domain in var.additional_custom_domains :
      can(regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$", domain))
    ])
    error_message = "additional_custom_domains entries must be valid DNS domain names."
  }
}
