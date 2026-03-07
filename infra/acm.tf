# =============================================================================
# acm.tf — SSL/TLS Certificate
# =============================================================================
# ACM (AWS Certificate Manager) provides free SSL certificates for AWS services.
#
# Key concepts:
#   - CloudFront requires its certificate in us-east-1 (hence the aliased provider)
#   - We use DNS validation: ACM gives us a CNAME record to add to Route 53,
#     and once AWS sees that record, it knows we own the domain and issues the cert
#   - The aws_acm_certificate_validation resource waits until the cert is fully
#     issued before Terraform moves on (CloudFront won't accept a pending cert)
# =============================================================================

# ---------------------------------------------------------------------------
# Request the certificate
# ---------------------------------------------------------------------------
# This doesn't actually issue the cert yet — it puts it in "pending validation"
# status. We still need to prove we own the domain via DNS.
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "grimoire" {
  provider = aws.us_east_1 # Must be us-east-1 for CloudFront

  domain_name       = var.domain_name
  validation_method = "DNS" # The alternative is "EMAIL" but DNS is fully automatable

  # When Terraform needs to replace a certificate (e.g., you change the domain),
  # this tells it to create the new one BEFORE destroying the old one, avoiding
  # downtime where CloudFront has no valid cert.
  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Create the DNS validation record in Route 53
# ---------------------------------------------------------------------------
# ACM tells us "add this CNAME record to prove you own the domain." We pull
# that info from the certificate resource and create the record automatically.
#
# The `for_each` + `toset()` pattern handles certs with multiple domain names
# (e.g., if you added a wildcard). For a single domain, this loop runs once.
# ---------------------------------------------------------------------------
resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.grimoire.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60       # Low TTL so validation happens quickly
  records = [each.value.record]

  # Allow overwriting in case the record already exists from a previous attempt
  allow_overwrite = true
}

# ---------------------------------------------------------------------------
# Wait for the certificate to be validated
# ---------------------------------------------------------------------------
# This resource doesn't create anything — it just blocks Terraform until ACM
# confirms the certificate is issued. Without this, CloudFront might try to
# use a certificate that's still pending and fail.
# ---------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "grimoire" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.grimoire.arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}
