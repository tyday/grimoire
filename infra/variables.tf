# =============================================================================
# variables.tf — Input variables
# =============================================================================
# Variables let us parameterize the Terraform config so the same code can be
# used for dev and prod environments. Values are supplied via .tfvars files
# (see environments/ directory).
#
# Variable precedence (highest to lowest):
#   1. Command-line flags: -var="foo=bar"
#   2. *.auto.tfvars files (auto-loaded, gitignored for secrets)
#   3. terraform.tfvars (auto-loaded)
#   4. Environment-specific .tfvars: -var-file="environments/prod.tfvars"
#   5. Default values defined here
# =============================================================================

variable "aws_region" {
  description = "The AWS region for most resources (Lambda, DynamoDB, etc.)"
  type        = string
  default     = "us-east-2" # Ohio — good balance of cost, latency, and service availability
}

variable "environment" {
  description = "Deployment environment: 'dev' or 'prod'. Used in resource naming and tags."
  type        = string

  # Validation blocks prevent typos and bad values at plan time
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be 'dev' or 'prod'."
  }
}

variable "domain_name" {
  description = "The full domain for the app (e.g., grimoire.habernashing.com)"
  type        = string
}

variable "hosted_zone_name" {
  description = "The Route 53 hosted zone that already exists for your domain (e.g., habernashing.com)"
  type        = string
}

variable "jwt_secret" {
  description = "Secret key for signing JWT access tokens (min 32 characters)"
  type        = string
  sensitive   = true # Prevents Terraform from showing this value in logs/plan output
}

variable "vapid_public_key" {
  description = "VAPID public key for Web Push notifications"
  type        = string
}

variable "vapid_private_key" {
  description = "VAPID private key for Web Push notifications"
  type        = string
  sensitive   = true
}
