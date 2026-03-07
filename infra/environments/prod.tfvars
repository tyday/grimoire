# =============================================================================
# prod.tfvars — Variable values for the prod environment
# =============================================================================
# Usage: terraform plan -var-file="environments/prod.tfvars"
# =============================================================================

environment      = "prod"
domain_name      = "grimoire.habernashing.com"
hosted_zone_name = "habernashing.com"
