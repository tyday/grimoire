# =============================================================================
# cloudfront.tf — CloudFront CDN Distribution
# =============================================================================
# CloudFront is AWS's Content Delivery Network. It caches your site at "edge
# locations" worldwide so users get fast responses from a server near them.
#
# For our use case (6 friends, probably all in the same region), the CDN
# caching isn't the main value — it's that CloudFront gives us:
#   1. HTTPS with our custom domain (grimoire.habernashing.com)
#   2. Automatic HTTP -> HTTPS redirect
#   3. SPA routing support (serve index.html for any path)
#   4. Gzip/Brotli compression for faster page loads
#
# How it works:
#   Browser requests grimoire.habernashing.com/some-page
#   -> Route 53 DNS resolves to CloudFront
#   -> CloudFront checks its cache
#   -> Cache miss: fetches from S3 origin
#   -> Returns response (and caches it for next time)
# =============================================================================

# ---------------------------------------------------------------------------
# Origin Access Control (OAC)
# ---------------------------------------------------------------------------
# OAC is the credential that CloudFront uses to authenticate with S3.
# It replaces the older "Origin Access Identity" (OAI). With OAC:
#   - CloudFront signs requests to S3 using SigV4
#   - S3 verifies the signature matches our distribution
#   - No one else can access the bucket directly
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "grimoire-frontend-oac-${var.environment}"
  description                       = "OAC for Grimoire frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"  # Always sign requests to S3
  signing_protocol                  = "sigv4"   # Use AWS Signature Version 4
}

# ---------------------------------------------------------------------------
# CloudFront Distribution
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html" # What to serve when someone visits the bare domain
  comment             = "Grimoire frontend (${var.environment})"

  # The custom domain(s) this distribution responds to.
  # Without this, it would only be accessible via the ugly *.cloudfront.net URL.
  aliases = [var.domain_name]

  # ---------------------------------------------------------------------------
  # Origin: where CloudFront fetches content from
  # ---------------------------------------------------------------------------
  # An "origin" is the source of truth for your content. CloudFront is just
  # a cache in front of it. Here, our origin is the S3 bucket.
  # ---------------------------------------------------------------------------
  origin {
    # For S3 origins, use the bucket's regional domain name (not the website endpoint)
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend" # An arbitrary ID we reference below
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ---------------------------------------------------------------------------
  # Default cache behavior: how CloudFront handles requests
  # ---------------------------------------------------------------------------
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]   # Static site, read-only
    cached_methods         = ["GET", "HEAD"]               # Only cache these
    target_origin_id       = "s3-frontend"                 # Points to the origin above
    viewer_protocol_policy = "redirect-to-https"           # HTTP -> HTTPS redirect
    compress               = true                          # Enable gzip/brotli

    # Use the AWS-managed "CachingOptimized" policy. This is a built-in caching
    # policy that works well for static sites — it caches based on the full URL
    # and respects standard cache headers.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized managed policy ID
  }

  # ---------------------------------------------------------------------------
  # Custom error responses: SPA routing support
  # ---------------------------------------------------------------------------
  # React uses client-side routing. When a user navigates to /polls/123 and
  # refreshes, the browser asks CloudFront for /polls/123 — but that file
  # doesn't exist in S3. Without this config, they'd get a 403 (access denied
  # on a missing S3 object).
  #
  # These rules say: "If S3 returns 403 or 404, serve index.html instead and
  # return 200. React Router will then look at the URL and render the right page."
  # ---------------------------------------------------------------------------
  custom_error_response {
    error_code            = 403                # S3 returns 403 for missing objects (with OAC)
    response_code         = 200                # Tell the browser it's a normal response
    response_page_path    = "/index.html"      # Serve the React app
    error_caching_min_ttl = 10                 # Cache this error response for 10 seconds
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  # ---------------------------------------------------------------------------
  # SSL certificate
  # ---------------------------------------------------------------------------
  # Tell CloudFront to use our ACM certificate for HTTPS on our custom domain.
  # "sni-only" means CloudFront uses Server Name Indication — the modern default.
  # The alternative ("vip") costs $600/month for a dedicated IP. Don't do that.
  # ---------------------------------------------------------------------------
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.grimoire.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021" # Modern TLS only, no old/insecure versions
  }

  # ---------------------------------------------------------------------------
  # Geographic restrictions
  # ---------------------------------------------------------------------------
  # We don't restrict by geography — no need for a private friend group.
  # ---------------------------------------------------------------------------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
