# =============================================================================
# dev.tfvars — Variable values for the dev environment
# =============================================================================
# Usage: terraform plan -var-file="environments/dev.tfvars"
#
# This file is checked into git. It contains no secrets — just configuration
# that differs between dev and prod. Secrets (like API keys) should go in
# *.auto.tfvars files, which are gitignored.
# =============================================================================

environment      = "dev"
domain_name      = "dev-grimoire.habernashing.com"
hosted_zone_name = "habernashing.com"
