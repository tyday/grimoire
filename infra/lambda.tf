# =============================================================================
# lambda.tf — Lambda Function and IAM Role
# =============================================================================
# Lambda runs your backend code without managing servers. You upload a zip
# file containing your code, and AWS runs it on demand when triggered by
# API Gateway, EventBridge, etc.
#
# Architecture:
#   API Gateway receives HTTP request
#   -> Routes it to the Lambda function
#   -> Lambda runs your Node.js handler
#   -> Returns the response to API Gateway
#   -> API Gateway returns it to the browser
#
# We use a single Lambda function for all API routes. API Gateway handles
# routing (which path maps to which handler), and the Lambda code dispatches
# internally. This is simpler than one Lambda per route for a small app.
#
# IAM (Identity and Access Management) controls what the Lambda can do.
# Every Lambda needs an "execution role" — an IAM role that grants it
# permissions. Without the right permissions, Lambda can't read DynamoDB,
# write logs, send emails, etc.
# =============================================================================

# ---------------------------------------------------------------------------
# IAM Role: the identity Lambda assumes when running
# ---------------------------------------------------------------------------
# An IAM role has two parts:
#   1. Trust policy (assume_role_policy): WHO can use this role
#      -> Here, only the Lambda service can assume it
#   2. Permission policies (attached below): WHAT the role can do
#      -> Read/write DynamoDB, write CloudWatch logs, send SES emails, etc.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lambda_exec" {
  name = "grimoire-lambda-exec-${var.environment}"

  # Trust policy: allow Lambda service to assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Permission policy: what the Lambda is allowed to do
# ---------------------------------------------------------------------------
# We scope permissions tightly:
#   - DynamoDB: only our tables, not all tables in the account
#   - CloudWatch Logs: only our log group
#   - SES: only send emails (for password reset)
#
# The "Resource" field uses ARNs (Amazon Resource Names) to specify exactly
# which resources the Lambda can access. This follows the principle of
# least privilege — the Lambda can't accidentally (or maliciously) access
# other resources in your AWS account.
# ---------------------------------------------------------------------------
resource "aws_iam_role_policy" "lambda_permissions" {
  name = "grimoire-lambda-permissions-${var.environment}"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # DynamoDB access to all our grimoire tables
        # The wildcard at the end covers the table itself AND its indexes
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ]
        Resource = [
          "${aws_dynamodb_table.users.arn}",
          "${aws_dynamodb_table.users.arn}/index/*",
          "${aws_dynamodb_table.refresh_tokens.arn}",
          "${aws_dynamodb_table.refresh_tokens.arn}/index/*",
          "${aws_dynamodb_table.push_subscriptions.arn}",
          "${aws_dynamodb_table.push_subscriptions.arn}/index/*",
          "${aws_dynamodb_table.polls.arn}",
          "${aws_dynamodb_table.polls.arn}/index/*",
          "${aws_dynamodb_table.responses.arn}",
          "${aws_dynamodb_table.responses.arn}/index/*",
          "${aws_dynamodb_table.sessions.arn}",
          "${aws_dynamodb_table.sessions.arn}/index/*",
        ]
      },
      {
        # CloudWatch Logs — Lambda needs this to write execution logs.
        # Without it, you'd get no logs when debugging issues.
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      },
      {
        # SES — send emails for password reset flows
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
        ]
        Resource = "*"
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda function
# ---------------------------------------------------------------------------
# The function itself. Key settings:
#   - runtime: Node.js version to run your code with
#   - handler: the file and function to invoke (index.handler means
#     "call the `handler` export from index.js")
#   - timeout: max execution time (default is 3s, we set 30s for safety)
#   - memory_size: more memory = faster CPU (Lambda allocates CPU proportionally)
#
# We start with a placeholder zip. The CI/CD pipeline will deploy real code.
# ---------------------------------------------------------------------------

# Create a minimal placeholder so Terraform can create the function.
# The actual code gets deployed by CI/CD.
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/placeholder.zip"

  source {
    content  = <<-EOF
      export const handler = async (event) => {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ok", message: "Grimoire API placeholder" }),
        };
      };
    EOF
    filename = "index.mjs"
  }
}

resource "aws_lambda_function" "api" {
  function_name = "grimoire-api-${var.environment}"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30      # seconds — generous for API calls that hit DynamoDB + SES
  memory_size   = 256      # MB — 256 is a good starting point for Node.js APIs

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  # Environment variables are how you pass config to Lambda. The code reads
  # these via process.env.TABLE_USERS, etc. This keeps table names and
  # settings out of your code and makes them environment-specific.
  environment {
    variables = {
      ENVIRONMENT          = var.environment
      TABLE_USERS          = aws_dynamodb_table.users.name
      TABLE_REFRESH_TOKENS = aws_dynamodb_table.refresh_tokens.name
      TABLE_PUSH_SUBS      = aws_dynamodb_table.push_subscriptions.name
      TABLE_POLLS          = aws_dynamodb_table.polls.name
      TABLE_RESPONSES      = aws_dynamodb_table.responses.name
      TABLE_SESSIONS       = aws_dynamodb_table.sessions.name
      JWT_SECRET           = var.jwt_secret
    }
  }

  # Ignore changes to the code — CI/CD deploys new code independently of
  # Terraform. Without this, Terraform would try to revert to the placeholder
  # every time you run `terraform apply`.
  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Group
# ---------------------------------------------------------------------------
# Lambda automatically creates a log group if one doesn't exist, but by
# creating it in Terraform we can:
#   - Control the retention period (Lambda default is "never delete")
#   - Ensure it gets cleaned up if we tear down the environment
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 30 # Keep logs for 30 days, then auto-delete
}
