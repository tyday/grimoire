# =============================================================================
# s3.tf — S3 Bucket for Frontend Static Hosting
# =============================================================================
# S3 (Simple Storage Service) is object storage — think of it as a filesystem
# in the cloud. We use it to host the compiled React app (HTML, JS, CSS).
#
# Architecture:
#   Users -> CloudFront (CDN) -> S3 (origin)
#
# We do NOT enable S3's built-in "static website hosting" feature. Instead,
# CloudFront accesses the bucket directly via OAC (Origin Access Control).
# This means:
#   - The S3 bucket stays fully private (no public access)
#   - All traffic goes through CloudFront, which handles HTTPS and caching
#   - OAC is the modern replacement for OAI (Origin Access Identity)
# =============================================================================

# ---------------------------------------------------------------------------
# The bucket itself
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  # Including the environment in the name lets dev and prod coexist.
  # S3 bucket names are globally unique across ALL AWS accounts, so we
  # include the project name to avoid collisions.
  bucket = "grimoire-frontend-${var.environment}"
}

# ---------------------------------------------------------------------------
# Block ALL public access
# ---------------------------------------------------------------------------
# This is a safety net. Even if someone accidentally adds a public bucket
# policy, these settings override it and keep the bucket private. Only
# CloudFront (via OAC) can read from this bucket.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Bucket policy: allow CloudFront to read objects
# ---------------------------------------------------------------------------
# This policy says: "Only the CloudFront distribution (identified by its OAC)
# is allowed to GetObject from this bucket." No one else — not even someone
# with the bucket URL — can access the files directly.
#
# The `data.aws_iam_policy_document` resource generates the JSON policy.
# Using this instead of raw JSON gives us validation and interpolation.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "frontend_bucket_policy" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"] # /* means all objects in the bucket

    # This condition ensures only OUR CloudFront distribution can access the
    # bucket, not just any CloudFront distribution in any AWS account.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_bucket_policy.json
}
