#!/usr/bin/env bash
# =============================================================================
# deploy-dev.sh — Build and deploy everything to the dev environment
# =============================================================================
# Usage: ./scripts/deploy-dev.sh [backend|frontend|infra|all]
#   No argument defaults to "all"
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENVIRONMENT="dev"
API_URL="https://api.dev-grimoire.habernashing.com"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}==>${NC} $1"; }

deploy_infra() {
  log "Applying Terraform (dev)..."
  cd "$ROOT_DIR/infra"
  terraform init -backend-config="key=grimoire/dev/terraform.tfstate" -reconfigure -input=false > /dev/null
  terraform apply -var-file="environments/dev.tfvars" -auto-approve
}

deploy_backend() {
  log "Building backend..."
  cd "$ROOT_DIR/backend"
  npm run build

  log "Packaging API Lambda..."
  cd dist && zip -j ../lambda.zip index.mjs && cd ..

  log "Packaging Reminder Lambda..."
  cd dist && zip -j ../reminder.zip reminder.mjs && cd ..

  log "Deploying API Lambda..."
  aws lambda update-function-code \
    --function-name "grimoire-api-$ENVIRONMENT" \
    --zip-file fileb://lambda.zip \
    --output text --query 'LastUpdateStatus'

  log "Deploying Reminder Lambda..."
  aws lambda update-function-code \
    --function-name "grimoire-reminder-$ENVIRONMENT" \
    --zip-file fileb://reminder.zip \
    --output text --query 'LastUpdateStatus'
}

deploy_frontend() {
  log "Building frontend..."
  cd "$ROOT_DIR/frontend"
  VITE_API_URL="$API_URL" npm run build

  log "Syncing to S3..."
  aws s3 sync dist/ "s3://grimoire-frontend-$ENVIRONMENT" --delete

  log "Invalidating CloudFront cache..."
  DISTRIBUTION_ID=$(cd "$ROOT_DIR/infra" && terraform output -raw cloudfront_distribution_id 2>/dev/null)
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --output text --query 'Invalidation.Status'
}

TARGET="${1:-all}"

case "$TARGET" in
  infra)
    deploy_infra
    ;;
  backend)
    deploy_backend
    ;;
  frontend)
    deploy_frontend
    ;;
  all)
    deploy_infra
    deploy_backend
    deploy_frontend
    ;;
  *)
    echo "Usage: $0 [backend|frontend|infra|all]"
    exit 1
    ;;
esac

log "Done!"
