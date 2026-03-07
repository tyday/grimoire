# Grimoire — App Requirements

## Overview

Grimoire is a Progressive Web App (PWA) serving as a campaign companion hub for a single, trusted group of developer friends playing Pathfinder. It combines session scheduling, real-time group chat, map sharing, character sheet storage, session notes, and a campaign wiki — all in one private, self-hosted space.

**URL:** `grimoire.habernashing.com`
**Audience:** One fixed group of ~6 players, all developers
**System:** Pathfinder (2e assumed, clarify if 1e)

---

## Build Phases

Features are delivered in phases. Each phase is independently deployable and usable.

| Phase | Feature |
|-------|---------|
| 1 | Scheduling |
| 2 | Real-time Group Chat |
| 3 | Session Notes |
| 4 | Character Sheet Storage |
| 5 | Map Sharing |
| 6 | Campaign Wiki / Lore |

---

## Phase 1: Scheduling (MVP)

### User Flows

**Propose a session poll**
- Any logged-in member creates a new scheduling poll
- Poll creator becomes the GM for that poll
- Two poll modes:
  - **Candidate dates** — creator picks 2–5 specific dates, members vote
  - **Open availability** — members submit availability, app surfaces best overlap
- All members receive a push notification when a poll is created

**Respond to a poll**
- Member opens app, marks available / unavailable dates
- App shows live results as responses come in, including who has and hasn't responded
- Members can update their response before the poll is confirmed

**Confirm a session**
- GM reviews results and confirms a final date
- All members receive a push notification with the confirmed date
- Confirmed session appears in an upcoming session view

**Calendar export**
- Any member can export a confirmed session as an `.ics` file
- Compatible with Apple Calendar, Google Calendar, Outlook

**Reminders**
- Push notification sent 2 days before a confirmed session (configurable)
- Push notification sent day-of

---

## Phase 2: Real-Time Group Chat

- Single group chat channel (one campaign, one room)
- Real-time messaging via WebSockets (AWS API Gateway WebSocket API)
- Message history persisted in DynamoDB
- Push notification for new messages when app is backgrounded
- Basic formatting support (bold, italic, code blocks) — Markdown subset
- Image/file attachment support (uploaded to S3)

---

## Phase 3: Session Notes

- Any member can create notes for a session
- Notes are associated with a confirmed session date
- Rich text editing (simple WYSIWYG or Markdown)
- Notes are readable by all group members
- Push notification when new notes are posted

---

## Phase 4: Character Sheet Storage

- Pathfinder-specific structured character sheets (form-based)
- PDF/image upload option as an alternative or supplement
- Each player owns their own sheet
- GM can view all sheets
- Sheets are versioned — previous versions accessible
- Core Pathfinder fields:
  - Ability scores, AC, HP, saves
  - Skills, feats, spells
  - Inventory / equipment
  - Character background / bio

---

## Phase 5: Map Sharing

- Upload image files as maps (JPG, PNG, WebP)
- Interactive layer: add named pins/markers to maps
- Pin types: location, NPC, point of interest, hazard
- GM can add/edit/delete pins; players can view
- Multiple maps supported (world map, regional, dungeon level, etc.)
- Maps associated with campaign, not individual sessions

---

## Phase 6: Campaign Wiki / Lore

- Simple wiki for campaign lore, NPCs, locations, factions
- Any member can create and edit entries
- Basic categorization (NPCs, Locations, Factions, History, Items)
- Internal linking between entries
- Search across all entries
- Edit history per entry

---

## Authentication

- Simple email + password accounts
- Passwords stored as bcrypt hashes (never plaintext)
- JWT handling via the `jose` library (no hand-rolled token creation/validation)
- Token strategy: short-lived access tokens (15 min) + long-lived refresh tokens (30 days) stored in DynamoDB
  - Access token: sent in `Authorization` header, stateless validation
  - Refresh token: httpOnly cookie, stored hashed in DB so they can be revoked
- Password reset via email link (AWS SES)
- No self-registration — accounts created by admin (closed group)

---

## Technical Stack

### Frontend
- **Framework:** React (Vite)
- **Type:** Progressive Web App (PWA)
  - Service worker for offline support and push notification handling
  - Web App Manifest for home screen installation
  - Push notifications require iOS 16.4+ with app added to home screen
- **Hosting:** AWS S3 + CloudFront
- **Domain:** `grimoire.habernashing.com` via Route 53 (existing domain)
- **HTTPS:** ACM certificate

### Backend
- **Compute:** AWS Lambda (Node.js)
- **API:** AWS API Gateway (REST/HTTP API for standard endpoints; WebSocket API for real-time chat)
- **Auth:** Custom JWT-based auth (bcrypt for password hashing)
- **Email:** AWS SES (password reset, transactional notifications)
- **Push Notifications:** `web-push` npm library (VAPID) called directly from Lambda, subscriptions stored in DynamoDB
- **File Storage:** AWS S3 (map images, character sheet PDFs, chat attachments)
- **Database:** AWS DynamoDB

### Infrastructure
- **IaC:** Terraform
- All resources defined as code — no manual console configuration
- Environments: `dev` and `prod`
- Subdomain routing via existing Route 53 hosted zone

---

## DynamoDB Data Model (Phase 1 starting point)

| Table | Partition Key | Sort Key | Notes |
|-------|--------------|----------|-------|
| `users` | `userId` | — | email, passwordHash |
| `push_subscriptions` | `userId` | `endpoint` | Web Push subscription data (VAPID) |
| `refresh_tokens` | `userId` | `tokenHash` | expiresAt, createdAt (for revocation) |
| `polls` | `pollId` | — | creatorId, mode, status, candidateDates |
| `responses` | `pollId` | `userId` | availability data per user per poll |
| `sessions` | `sessionId` | — | confirmedDate, pollId |

*Additional tables will be added per phase.*

---

## AWS Services by Phase

| Service | Phase | Purpose |
|---------|-------|---------|
| S3 | 1 | Frontend static hosting |
| CloudFront | 1 | CDN + HTTPS |
| Route 53 | 1 | Subdomain DNS |
| ACM | 1 | SSL/TLS certificate |
| API Gateway (HTTP) | 1 | REST API routing |
| Lambda | 1 | Backend business logic |
| DynamoDB | 1 | Data storage |
| SES | 1 | Transactional email |
| — | 1 | Web Push via `web-push` library (no SNS needed) |
| API Gateway (WebSocket) | 2 | Real-time chat connections |
| S3 (media bucket) | 2 | Chat attachments, map images |
| EventBridge | 1 | Scheduled reminder Lambdas |

---

## CI/CD

- **Platform:** GitHub Actions
- **Frontend pipeline:**
  - On push to `main`: build React app, sync to S3, invalidate CloudFront cache
  - On PR: build + lint + test (no deploy)
- **Backend pipeline:**
  - On push to `main`: package Lambda functions, deploy via Terraform
  - On PR: lint + test + `terraform plan` (posted as PR comment)
- **Infrastructure pipeline:**
  - Terraform changes applied automatically on merge to `main` (prod)
  - `dev` environment deployed from feature branches on demand
- **Secrets:** AWS credentials stored as GitHub Actions secrets (OIDC preferred if feasible)

---

## Non-Functional Requirements

- All traffic over HTTPS
- No third-party analytics or tracking
- Passwords never stored in plaintext
- Push notification subscriptions stored per user, deletable
- No self-registration — closed group only

---

## Out of Scope

- Multiple campaigns / multi-tenancy
- OAuth / social login
- Native mobile app
- Dice roller
- Real-time collaborative map editing (GM controls pins)
- Video/voice chat

---

## Suggested Phase 1 Build Order

1. Terraform: Route 53 subdomain + ACM certificate + S3 + CloudFront
2. React PWA scaffold with service worker and manifest
3. GitHub Actions CI/CD pipelines (frontend deploy + `terraform plan/apply`)
4. Terraform: DynamoDB tables + Lambda + API Gateway
5. Health-check endpoint to validate full deployment pipeline
6. Auth flows (admin account creation, login/refresh, password reset via SES)
7. Poll creation and response flows
8. Push notification setup via `web-push` (VAPID)
9. Session confirmation + `.ics` export
10. Reminder notifications (scheduled Lambda via EventBridge)
