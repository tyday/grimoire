# =============================================================================
# main.tf — Provider configuration and shared settings
# =============================================================================
# This is the entry point for Terraform. It declares:
#   1. Which version of Terraform we require
#   2. Which "providers" (cloud APIs) we use and their versions
#   3. Where Terraform stores its state file
#
# Providers are plugins that let Terraform talk to cloud services.
# We need TWO AWS providers here because CloudFront requires its SSL
# certificate to be in us-east-1, even if our other resources are elsewhere.
# =============================================================================

terraform {
  # Require Terraform 1.5+ for modern features like import blocks
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0" # The ~> operator means "5.x but not 6.x"
    }
  }

  # ---------------------------------------------------------------------------
  # Backend: where Terraform stores its state
  # ---------------------------------------------------------------------------
  # Terraform tracks every resource it creates in a "state file." By default
  # this is a local file (terraform.tfstate), but for a team project we store
  # it in S3 so everyone shares the same state. DynamoDB provides locking so
  # two people can't apply changes simultaneously.
  #
  # IMPORTANT: You must create this S3 bucket and DynamoDB table manually
  # BEFORE running `terraform init`. This is a chicken-and-egg problem —
  # Terraform can't create the bucket it needs to store its own state in.
  #
  # To create them (one-time setup):
  #   aws s3api create-bucket --bucket grimoire-terraform-state --region us-east-2
  #   aws dynamodb create-table \
  #     --table-name grimoire-terraform-locks \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST \
  #     --region us-east-2
  # ---------------------------------------------------------------------------
  backend "s3" {
    bucket         = "grimoire-terraform-state"
    key            = "grimoire/terraform.tfstate" # Path inside the bucket
    region         = "us-east-2"
    dynamodb_table = "grimoire-terraform-locks"   # For state locking
    encrypt        = true                          # Encrypt state at rest
  }
}

# ---------------------------------------------------------------------------
# Default AWS provider — our primary region for most resources
# ---------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  # Tags applied to EVERY resource Terraform creates. Useful for cost tracking
  # and identifying which resources belong to this project.
  default_tags {
    tags = {
      Project     = "grimoire"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ---------------------------------------------------------------------------
# Secondary AWS provider — us-east-1 only, for CloudFront's ACM certificate
# ---------------------------------------------------------------------------
# CloudFront is a global service, but AWS requires its SSL certificates to
# live in us-east-1. We create an aliased provider so we can target that
# region for just the certificate resource.
#
# Usage: In acm.tf, the certificate resource will have:
#   provider = aws.us_east_1
# ---------------------------------------------------------------------------
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "grimoire"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
