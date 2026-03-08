# =============================================================================
# outputs.tf — Values to display after `terraform apply`
# =============================================================================
# Outputs serve two purposes:
#   1. They print useful info after apply (URLs, IDs you'll need later)
#   2. They can be consumed by other Terraform configs or CI/CD scripts
#      via `terraform output -raw <name>`
#
# Think of outputs as the "return values" of your Terraform config.
# =============================================================================

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — needed for cache invalidation during deploys"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "The default CloudFront URL (*.cloudfront.net) — useful for testing before DNS propagates"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_bucket_name" {
  description = "S3 bucket name — the CI/CD pipeline uses this to sync built frontend files"
  value       = aws_s3_bucket.frontend.id
}

output "site_url" {
  description = "The live site URL"
  value       = "https://${var.domain_name}"
}

output "api_url" {
  description = "The API URL (custom domain)"
  value       = "https://api.${var.domain_name}"
}

output "lambda_function_name" {
  description = "Lambda function name — used by CI/CD to deploy new code"
  value       = aws_lambda_function.api.function_name
}

output "reminder_function_name" {
  description = "Reminder Lambda function name — used by CI/CD to deploy new code"
  value       = aws_lambda_function.reminder.function_name
}
