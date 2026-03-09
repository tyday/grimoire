# =============================================================================
# dynamodb.tf — DynamoDB Tables
# =============================================================================
# DynamoDB is a fully managed NoSQL database. Unlike traditional SQL databases
# (PostgreSQL, MySQL), you don't define all your columns upfront — you only
# define the keys. Everything else is schemaless (each item can have different
# attributes).
#
# Key concepts:
#   - Partition Key (PK): The primary lookup key. DynamoDB hashes this to
#     decide which physical partition stores the item. Every query must
#     include the partition key.
#   - Sort Key (SK): Optional secondary key. Combined with PK, it forms a
#     unique composite key. Items with the same PK are stored together and
#     sorted by SK, enabling range queries.
#   - GSI (Global Secondary Index): An alternate set of keys that lets you
#     query the table in a different way. Like creating a second "view" of
#     the same data with different PK/SK.
#   - PAY_PER_REQUEST: You pay per read/write operation instead of
#     provisioning fixed capacity. Perfect for low/unpredictable traffic
#     like our ~6 user app.
# =============================================================================

# ---------------------------------------------------------------------------
# Users table
# ---------------------------------------------------------------------------
# Stores user accounts. One item per user.
# Accessed by userId (login sessions, profile lookups) and by email (login).
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "users" {
  name         = "grimoire-users-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S" # S = String, N = Number, B = Binary
  }

  attribute {
    name = "email"
    type = "S"
  }

  # GSI lets us look up a user by email (for login).
  # Without this, we'd need to scan the entire table to find a user by email.
  global_secondary_index {
    name            = "email-index"
    hash_key        = "email"
    projection_type = "ALL" # Include all attributes in the index (not just keys)
  }
}

# ---------------------------------------------------------------------------
# Refresh tokens table
# ---------------------------------------------------------------------------
# Stores hashed refresh tokens for JWT auth. Each user can have multiple
# active refresh tokens (e.g., logged in on phone and laptop).
#
# PK: userId, SK: tokenHash — so we can:
#   - Look up a specific token to validate it
#   - Query all tokens for a user (to revoke all sessions)
#
# TTL (Time To Live) automatically deletes expired tokens. DynamoDB checks
# the ttl attribute and removes items whose value is in the past. This is
# eventually consistent (can take up to 48 hours), but it's free and keeps
# the table clean without any cron jobs.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "refresh_tokens" {
  name         = "grimoire-refresh-tokens-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "tokenHash" # range_key is Terraform's name for "sort key"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "tokenHash"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt" # DynamoDB will auto-delete items when this timestamp passes
    enabled        = true
  }
}

# ---------------------------------------------------------------------------
# Push subscriptions table
# ---------------------------------------------------------------------------
# Stores Web Push subscription data (VAPID). Each user can have multiple
# subscriptions (one per device/browser).
#
# PK: userId, SK: endpoint — the endpoint URL uniquely identifies a
# browser's push subscription.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "push_subscriptions" {
  name         = "grimoire-push-subscriptions-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "endpoint"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "endpoint"
    type = "S"
  }
}

# ---------------------------------------------------------------------------
# Polls table
# ---------------------------------------------------------------------------
# Stores scheduling polls. One item per poll.
# We add a GSI on status so we can efficiently query "all active polls"
# without scanning the entire table.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "polls" {
  name         = "grimoire-polls-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pollId"

  attribute {
    name = "pollId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "campaignId"
    type = "S"
  }

  # GSI to query polls by status (e.g., "active", "confirmed", "cancelled").
  # Without this, finding all active polls would require a full table scan.
  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  # GSI to query all polls for a specific campaign, sorted by status.
  global_secondary_index {
    name            = "campaign-index"
    hash_key        = "campaignId"
    range_key       = "status"
    projection_type = "ALL"
  }
}

# ---------------------------------------------------------------------------
# Responses table
# ---------------------------------------------------------------------------
# Stores poll responses. One item per user per poll.
# PK: pollId, SK: userId — so we can query all responses for a given poll.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "responses" {
  name         = "grimoire-responses-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pollId"
  range_key    = "userId"

  attribute {
    name = "pollId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }
}

# ---------------------------------------------------------------------------
# Sessions table
# ---------------------------------------------------------------------------
# Stores confirmed game sessions (not auth sessions — those are JWTs).
# One item per confirmed session date.
#
# GSI on confirmedDate lets us query "upcoming sessions" efficiently by
# sorting on the date.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Invites table
# ---------------------------------------------------------------------------
# Stores one-time invite tokens for user registration. Any authenticated
# user can generate an invite link. The link contains a token that allows
# a new user to register without needing admin access.
#
# PK: token — a random UUID that appears in the invite URL.
# TTL on expiresAt auto-deletes expired invites after 7 days.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "invites" {
  name         = "grimoire-invites-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "token"

  attribute {
    name = "token"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

# ---------------------------------------------------------------------------
# Campaigns table
# ---------------------------------------------------------------------------
# Stores campaigns. One item per campaign.
# Each campaign has a name, description, and creation timestamp.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "campaigns" {
  name         = "grimoire-campaigns-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "campaignId"

  attribute {
    name = "campaignId"
    type = "S"
  }
}

# ---------------------------------------------------------------------------
# Campaign members table
# ---------------------------------------------------------------------------
# Links users to campaigns with a role (gm or player).
# PK: campaignId, SK: userId — query all members of a campaign.
# GSI on userId — query all campaigns a user belongs to.
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "campaign_members" {
  name         = "grimoire-campaign-members-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "campaignId"
  range_key    = "userId"

  attribute {
    name = "campaignId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # GSI to query "which campaigns does this user belong to?"
  global_secondary_index {
    name            = "user-campaigns-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }
}

# ---------------------------------------------------------------------------
# Sessions table
# ---------------------------------------------------------------------------
resource "aws_dynamodb_table" "sessions" {
  name         = "grimoire-sessions-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  attribute {
    name = "confirmedDate"
    type = "S"
  }

  attribute {
    name = "campaignId"
    type = "S"
  }

  # GSI to query sessions ordered by date. We use a fixed "type" partition
  # key (e.g., "SESSION") because GSIs need a partition key, and we want
  # to query ALL sessions sorted by date. This is a common DynamoDB pattern
  # called a "sparse GSI" or "type-prefixed GSI."
  global_secondary_index {
    name            = "date-index"
    hash_key        = "type"
    range_key       = "confirmedDate"
    projection_type = "ALL"
  }

  # GSI to query all sessions for a specific campaign, sorted by date.
  global_secondary_index {
    name            = "campaign-date-index"
    hash_key        = "campaignId"
    range_key       = "confirmedDate"
    projection_type = "ALL"
  }
}
