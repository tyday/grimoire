# =============================================================================
# reminder.tf — Scheduled Reminder Lambda + EventBridge
# =============================================================================
# This is a separate Lambda that runs on a daily schedule. It checks for
# upcoming sessions and sends push notification reminders.
#
# Architecture:
#   EventBridge (cron schedule)
#   -> Triggers the reminder Lambda once daily
#   -> Lambda queries DynamoDB for upcoming sessions
#   -> Sends push notifications via web-push
#
# Why a separate Lambda?
#   The API Lambda (index.mjs) handles HTTP requests. This Lambda runs on a
#   timer with no HTTP input. Keeping them separate means each has its own
#   timeout, memory, and error handling. A failing reminder won't affect the
#   API, and vice versa.
# =============================================================================

# ---------------------------------------------------------------------------
# Reminder Lambda function
# ---------------------------------------------------------------------------
# Uses the same IAM role as the API Lambda — it needs the same DynamoDB and
# CloudWatch permissions. No need to create a duplicate role for ~6 users.
# ---------------------------------------------------------------------------

data "archive_file" "reminder_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/reminder-placeholder.zip"

  source {
    content  = <<-EOF
      export const handler = async () => {
        return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
      };
    EOF
    filename = "reminder.mjs"
  }
}

resource "aws_lambda_function" "reminder" {
  function_name = "grimoire-reminder-${var.environment}"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "reminder.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.reminder_placeholder.output_path
  source_code_hash = data.archive_file.reminder_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT          = var.environment
      TABLE_SESSIONS       = aws_dynamodb_table.sessions.name
      TABLE_PUSH_SUBS      = aws_dynamodb_table.push_subscriptions.name
      VAPID_PUBLIC_KEY     = var.vapid_public_key
      VAPID_PRIVATE_KEY    = var.vapid_private_key
    }
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_cloudwatch_log_group" "reminder" {
  name              = "/aws/lambda/${aws_lambda_function.reminder.function_name}"
  retention_in_days = 30
}

# ---------------------------------------------------------------------------
# EventBridge Schedule
# ---------------------------------------------------------------------------
# EventBridge (formerly CloudWatch Events) is AWS's scheduler service.
# A "rule" defines WHEN something runs, and a "target" defines WHAT runs.
#
# Schedule expression: cron(0 14 * * ? *)
#   = Every day at 14:00 UTC (9:00 AM Eastern / 10:00 AM Eastern DST)
#   Format: cron(minutes hours day-of-month month day-of-week year)
#   The "?" means "no specific value" (required for day-of-week when
#   day-of-month is specified, and vice versa).
#
# This runs the reminder Lambda once daily. The Lambda then checks if any
# sessions are today or 2 days away and sends notifications accordingly.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "daily_reminder" {
  name                = "grimoire-daily-reminder-${var.environment}"
  description         = "Triggers session reminder Lambda daily at 9 AM Eastern"
  schedule_expression = "cron(0 14 * * ? *)"
}

# The target connects the schedule rule to our Lambda function
resource "aws_cloudwatch_event_target" "reminder_target" {
  rule = aws_cloudwatch_event_rule.daily_reminder.name
  arn  = aws_lambda_function.reminder.arn
}

# ---------------------------------------------------------------------------
# Lambda permission for EventBridge
# ---------------------------------------------------------------------------
# Just like API Gateway needs permission to invoke the API Lambda,
# EventBridge needs permission to invoke the reminder Lambda.
# Without this, the schedule would fire but Lambda would reject the invoke.
# ---------------------------------------------------------------------------
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reminder.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_reminder.arn
}
