# Grimoire

A self-hosted PWA for managing Pathfinder 1e campaign sessions — scheduling, polls, push notifications, and more.

## Prerequisites

- Node.js 22+ (see `.nvmrc`)
- AWS CLI configured with appropriate credentials
- Terraform 1.x
- An AWS account with permissions for: Lambda, API Gateway, DynamoDB, S3, CloudFront, Route 53, ACM, EventBridge

## Project Structure

```
grimoire/
├── frontend/          # React + Vite PWA
├── backend/           # Node.js Lambda functions (esbuild)
├── infra/             # Terraform infrastructure-as-code
├── scripts/           # Deploy scripts
├── bruno/             # API test collection (Bruno)
└── .github/workflows/ # CI/CD (GitHub Actions)
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/tyday/grimoire.git
cd grimoire

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && npm install && cd ..
```

### 2. Configure DNS

The app expects a hosted zone in Route 53. Update `infra/environments/dev.tfvars` and `prod.tfvars` with your domain:

```hcl
environment      = "dev"
domain_name      = "dev-grimoire.yourdomain.com"
hosted_zone_name = "yourdomain.com"
```

### 3. Generate secrets

**JWT secret** — any random string, 32+ characters:

```bash
openssl rand -base64 48
```

**VAPID keys** — for web push notifications:

```bash
npx web-push generate-vapid-keys
```

### 4. Create a Terraform secrets file

Create `infra/environments/dev.auto.tfvars` (gitignored):

```hcl
jwt_secret       = "your-jwt-secret-here"
vapid_public_key = "your-vapid-public-key"
vapid_private_key = "your-vapid-private-key"
```

### 5. Initialize Terraform

Terraform state is stored in S3. Create the state bucket first, then:

```bash
cd infra
terraform init -backend-config="key=grimoire/dev/terraform.tfstate"
```

State backend is configured in `main.tf` — update the bucket name if you're not using the default.

### 6. Deploy infrastructure

```bash
terraform apply -var-file="environments/dev.tfvars" -var-file="environments/dev.auto.tfvars"
```

This creates all AWS resources: DynamoDB tables, Lambda functions, API Gateway, S3 buckets, CloudFront distribution, ACM certificate, and Route 53 records.

### 7. Deploy backend

```bash
cd backend
npm run build
cd dist && zip -j ../lambda.zip index.mjs && cd ..
cd dist && zip -j ../reminder.zip reminder.mjs && cd ..

aws lambda update-function-code \
  --function-name "grimoire-api-dev" \
  --zip-file fileb://lambda.zip

aws lambda update-function-code \
  --function-name "grimoire-reminder-dev" \
  --zip-file fileb://reminder.zip
```

### 8. Deploy frontend

```bash
cd frontend
VITE_API_URL="https://api.dev-grimoire.yourdomain.com" npm run build
aws s3 sync dist/ "s3://grimoire-frontend-dev" --delete
```

Then invalidate CloudFront:

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### 9. Create the first user

There's no default admin account. Bootstrap the first user by temporarily setting the `BOOTSTRAP_SECRET` environment variable on the API Lambda, then calling:

```bash
curl -X POST https://api.dev-grimoire.yourdomain.com/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password", "name": "Your Name", "bootstrapSecret": "the-secret"}'
```

Remove the `BOOTSTRAP_SECRET` env var after creating the first user. Subsequent users register via invite links generated from the dashboard.

## Dev Deploy Script

Once infrastructure is set up, use the convenience script:

```bash
./scripts/deploy-dev.sh           # Deploy everything
./scripts/deploy-dev.sh backend   # Backend only
./scripts/deploy-dev.sh frontend  # Frontend only
./scripts/deploy-dev.sh infra     # Terraform only
```

## Local Development

```bash
# Frontend dev server
cd frontend
VITE_API_URL="https://api.dev-grimoire.yourdomain.com" npm run dev
```

The backend runs on Lambda — there's no local backend server. During development, the frontend dev server points at the deployed dev API.

## CI/CD

GitHub Actions handles deployment automatically:

- **Pull requests** → frontend build check + Terraform plan (posted as PR comment)
- **Push to main** → Terraform apply + backend deploy + frontend deploy (all to prod)

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user credentials for deployments |
| `AWS_SECRET_ACCESS_KEY` | IAM user credentials for deployments |
| `JWT_SECRET` | JWT signing secret (32+ chars) |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |

## Tech Stack

- **Frontend:** React, TypeScript, Vite, vite-plugin-pwa
- **Backend:** Node.js 22, AWS Lambda, esbuild
- **Database:** DynamoDB
- **Auth:** JWT (jose) + bcrypt, httpOnly refresh cookies
- **Push:** web-push (VAPID)
- **Infra:** Terraform, API Gateway, CloudFront, S3, Route 53, EventBridge
- **CI/CD:** GitHub Actions
