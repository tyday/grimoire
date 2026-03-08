# =============================================================================
# api_gateway.tf — API Gateway (HTTP API)
# =============================================================================
# API Gateway is the front door for your backend. It receives HTTP requests
# from the browser and routes them to your Lambda function.
#
# AWS offers two types of API Gateway:
#   - REST API: More features (request validation, API keys, WAF), more expensive
#   - HTTP API: Simpler, faster, cheaper, good enough for most use cases
#
# We use HTTP API because it's ~70% cheaper, has lower latency, and supports
# everything we need (CORS, JWT authorizers, Lambda integration).
#
# Request flow:
#   Browser -> https://api.grimoire.habernashing.com/polls
#           -> API Gateway receives the request
#           -> Checks CORS headers
#           -> Routes to Lambda based on method + path
#           -> Lambda processes and returns response
#           -> API Gateway forwards response to browser
# =============================================================================

# ---------------------------------------------------------------------------
# The API Gateway itself
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_api" "main" {
  name          = "grimoire-api-${var.environment}"
  protocol_type = "HTTP"
  description   = "Grimoire API (${var.environment})"

  # CORS (Cross-Origin Resource Sharing) configuration.
  # The frontend (grimoire.habernashing.com) needs to call the API
  # (api.grimoire.habernashing.com). Browsers block cross-origin requests
  # by default for security. CORS headers tell the browser "it's OK,
  # this origin is allowed to call me."
  cors_configuration {
    allow_origins = [
      "https://${var.domain_name}",
      "http://localhost:5173", # Vite dev server for local development
    ]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization"]
    allow_credentials = true # Required for httpOnly refresh token cookies
    max_age           = 3600 # Cache preflight responses for 1 hour
  }
}

# ---------------------------------------------------------------------------
# Stage: the deployment target
# ---------------------------------------------------------------------------
# A "stage" is a named deployment of your API (like "v1", "prod", "dev").
# We use "$default" which means requests don't need a stage prefix in the URL.
# With a named stage, the URL would be /prod/polls; with $default, it's just /polls.
#
# auto_deploy = true means any changes to routes or integrations are
# deployed immediately. No manual "deploy" step needed.
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # Access logging — every request gets logged to CloudWatch.
  # Invaluable for debugging "why is my API returning 500?"
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn

    # Log format — what fields to include in each log entry.
    # These are API Gateway context variables.
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      method         = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      latency        = "$context.responseLatency"
      errorMessage   = "$context.error.message"
    })
  }
}

# CloudWatch log group for API Gateway access logs
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/grimoire-api-${var.environment}"
  retention_in_days = 30
}

# ---------------------------------------------------------------------------
# Integration: connect API Gateway to Lambda
# ---------------------------------------------------------------------------
# An "integration" tells API Gateway what to do with a matched request.
# AWS_PROXY means API Gateway forwards the entire HTTP request to Lambda
# as-is (method, path, headers, body, query params) and passes Lambda's
# response back to the client unchanged. This is the simplest integration
# type and the one most web frameworks expect.
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0" # v2.0 has a cleaner event format than v1.0
}

# ---------------------------------------------------------------------------
# Route: catch-all
# ---------------------------------------------------------------------------
# Routes map HTTP method + path to an integration. We use a catch-all route
# ($default) that sends ALL requests to our single Lambda function. The Lambda
# code handles its own routing internally (e.g., with a router library).
#
# This is simpler than defining individual routes in Terraform. When you add
# a new API endpoint, you just add it in code — no Terraform changes needed.
# ---------------------------------------------------------------------------
resource "aws_apigatewayv2_route" "catch_all" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default" # Matches any method + any path

  target = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# ---------------------------------------------------------------------------
# Lambda permission: allow API Gateway to invoke Lambda
# ---------------------------------------------------------------------------
# Even though we've set up the route and integration, API Gateway still
# needs explicit permission to call the Lambda function. AWS IAM requires
# this — just because YOU can see both resources doesn't mean they can
# talk to each other. This resource grants that permission.
# ---------------------------------------------------------------------------
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Custom domain for the API
# ---------------------------------------------------------------------------
# Without this, the API URL would be something ugly like:
#   https://abc123.execute-api.us-east-2.amazonaws.com
#
# With a custom domain, it becomes:
#   https://api.grimoire.habernashing.com
# ---------------------------------------------------------------------------

# ACM certificate for the API subdomain (in the same region as API Gateway)
resource "aws_acm_certificate" "api" {
  domain_name       = "api.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_cert_validation : record.fqdn]
}

# Map the custom domain to API Gateway
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = "api.${var.domain_name}"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# Connect the custom domain to our API stage
resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

# DNS record pointing api.grimoire.habernashing.com to API Gateway
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
