# =============================================================================
# route53.tf — DNS Configuration
# =============================================================================
# Route 53 is AWS's DNS service. It translates human-readable domain names
# (grimoire.habernashing.com) into the addresses that browsers actually connect to.
#
# We're using an EXISTING hosted zone (habernashing.com) — we don't create it
# here because the domain was already registered and configured. We just look
# it up with a "data source" and add our subdomain record to it.
#
# Data sources vs. resources:
#   - resource: Terraform creates and manages it (e.g., the S3 bucket)
#   - data source: Terraform reads it but doesn't create or modify it
#     Think of it as a read-only lookup.
# =============================================================================

# ---------------------------------------------------------------------------
# Look up the existing hosted zone
# ---------------------------------------------------------------------------
# A hosted zone is a container for DNS records for a domain. Since
# habernashing.com already exists in Route 53, we look it up by name
# so we can add records to it.
# ---------------------------------------------------------------------------
data "aws_route53_zone" "main" {
  name         = var.hosted_zone_name
  private_zone = false # This is a public DNS zone (not a private VPC zone)
}

# ---------------------------------------------------------------------------
# A record: point our subdomain to CloudFront
# ---------------------------------------------------------------------------
# An "A" record normally maps a domain to an IP address. But CloudFront
# doesn't have a single IP — it has thousands of edge locations. So we use
# an "alias" record, which is a Route 53-specific feature that maps a domain
# directly to an AWS resource (like a CloudFront distribution).
#
# Alias records are:
#   - Free (normal Route 53 queries cost $0.40 per million)
#   - Automatically updated if CloudFront's IPs change
#   - Support the "zone apex" (bare domain like habernashing.com)
# ---------------------------------------------------------------------------
resource "aws_route53_record" "frontend" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false # CloudFront is always "healthy" from DNS perspective
  }
}

# ---------------------------------------------------------------------------
# AAAA record: same as above, but for IPv6
# ---------------------------------------------------------------------------
# We enabled IPv6 on CloudFront (is_ipv6_enabled = true), so we need an
# AAAA record too. AAAA is the IPv6 equivalent of an A record.
# ---------------------------------------------------------------------------
resource "aws_route53_record" "frontend_ipv6" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
