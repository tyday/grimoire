# Grimoire — App Requirements

## Overview

Grimoire is a Progressive Web App (PWA) serving as a campaign companion hub for a trusted group of developer friends playing Pathfinder 1e. It combines session scheduling, real-time group chat, map sharing, character sheet storage, session notes, and a campaign wiki — all in one private, self-hosted space.

**URL:** `grimoire.habernashing.com`
**Audience:** ~6 players, all developers
**System:** Pathfinder 1e

---

## Build Phases

Features are delivered in phases. Each phase is independently deployable and usable.

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Scheduling | ✅ Complete |
| 2 | Tests | |
| 3 | Runtime Caching & Offline | |
| 4 | Campaigns | |
| 5 | Session Notes | |
| 6 | Character Sheets | |
| 7 | Real-Time Group Chat | |
| 8 | Map Sharing | |
| 9 | Campaign Wiki / Lore | |

---

## Phase 1: Scheduling ✅

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
- Push notification sent 2 days before a confirmed session
- Push notification sent day-of

**Extras delivered in Phase 1**
- Cancel polls (non-destructive status change)
- Invite links (multi-use, 7-day expiry) for user registration
- Info page with frontend/backend/SW versioning
- Test notification button
- PWA icons (gold spellbook theme)
- Bruno API test collection
- `scripts/deploy-dev.sh` for dev deployments

---

## Phase 2: Tests

Add backend and frontend test coverage for Phase 1 features.

### Backend (Node.js built-in test runner)
- **Library unit tests** — JWT creation/verification, password hashing, ICS generation
- **Route handler tests** — auth flows, poll CRUD, session queries (with mocked DynamoDB)

### Frontend (Vitest + React Testing Library)
- **Component tests** — Login, Dashboard, PollDetail, Sessions, CreatePoll
- **API client tests** — token refresh logic, error handling
- **Auth context tests** — login/logout state management

### Build Order
1. Backend lib tests (auth, passwords, ics)
2. Frontend test infrastructure (vitest, RTL, jsdom)
3. Frontend component tests
4. Add test steps to CI (PR workflow)

---

## Phase 3: Runtime Caching & Offline

Add workbox runtime caching so previously-viewed data is available offline (read-only).

### Features
- **Offline indicator** — visible banner/badge when the device is offline
- **API response caching** — workbox strategies for GET endpoints:
  - Stale-while-revalidate for polls, sessions, dashboard data
  - Cache-first for static-ish data (user profiles, campaign metadata)
  - Network-only for mutations (POST/PUT/DELETE)
- **Offline-friendly UI** — disable action buttons when offline, show cached data gracefully
- **Cache versioning** — clear stale caches on SW update

### Build Order
1. Offline indicator component (online/offline event listeners)
2. Workbox runtime caching strategies in vite config
3. Disable mutation buttons when offline
4. Test offline behavior across pages

---

## Phase 4: Campaigns

Introduce multi-campaign support. Players can belong to multiple campaigns. Sessions, polls, notes, characters, and maps are scoped to a campaign.

### Data Model
- **Campaigns table** — `campaignId` (PK), name, description, createdAt
- **Campaign members table** — `campaignId` (PK), `userId` (SK), role (`gm` | `player`), joinedAt
- Existing tables (polls, sessions, responses) gain a `campaignId` attribute
- GSI on campaignId for querying campaign-scoped data

### User Flows
- **Create a campaign** — any user can create a campaign (they become GM)
- **Campaign switcher** — top-level UI to switch active campaign
- **Campaign membership** — roles stored (gm/player) but not enforced yet (any member can create polls, confirm sessions). Roles reserved for future use (e.g., GM-only map editing).
- **Invite links** — remain app-wide (user joins the app, then gets added to campaigns)

### Retrofit
- Add `campaignId` to polls, sessions, responses
- Migrate existing data (backfill with a default campaign)
- All Phase 1 UI becomes campaign-scoped (poll list shows current campaign's polls, etc.)

### Build Order
1. Campaigns DynamoDB table + members table + Terraform
2. Campaign CRUD endpoints (create, list, get, add member)
3. Add campaignId to poll/session creation and queries
4. Data migration script for existing dev/prod data
5. Frontend: campaign switcher UI + scoped views
6. Frontend: create/manage campaign page

---

## Phase 5: Session Notes

- Any member can create/edit notes for a session (campaign-scoped)
- Notes are associated with a confirmed session
- **Markdown editing** with preview
- Notes are readable by all campaign members
- Push notification when new notes are posted
- Cached offline via Phase 3 runtime caching

---

## Phase 6: Character Sheets

Pathfinder 1e structured character sheets, campaign-scoped.

### MVP Fields
- **Basic info:** name, race, class, level, alignment, deity
- **Ability scores:** STR, DEX, CON, INT, WIS, CHA (base + modifiers)
- **Combat stats:** HP (current/max), AC, initiative, BAB, CMB/CMD
- **Saving throws:** Fort, Ref, Will (base + ability + misc)
- **Freeform notes:** markdown field for feats, spells, inventory, background, and anything else

### Later Iterations
- Structured skills list with ranks and modifiers
- Structured feats and class features
- Spell slots and spell lists
- Inventory with weight tracking
- Sheet versioning (previous versions accessible)

### Other
- Each player owns their sheet(s) — one per character per campaign
- GM can view all sheets in the campaign
- PDF/image upload as supplement
- Cached offline via Phase 3 runtime caching

---

## Phase 7: Real-Time Group Chat

- One chat channel per campaign
- Real-time messaging via WebSockets (AWS API Gateway WebSocket API)
- Message history persisted in DynamoDB
- Push notification for new messages when app is backgrounded
- Basic formatting support (Markdown subset)
- Image/file attachment support (uploaded to S3)

---

## Phase 8: Map Sharing

- Upload image files as maps (JPG, PNG, WebP) — stored in S3, served via CloudFront
- Interactive layer: add named pins/markers to maps
- Pin types: location, NPC, point of interest, hazard
- GM can add/edit/delete pins; players can view
- Multiple maps per campaign (world map, regional, dungeon level, etc.)
- Campaign-scoped
- Cached offline (cache-first via SW for map images)

---

## Phase 9: Campaign Wiki / Lore

- Simple wiki for campaign lore, NPCs, locations, factions
- Any campaign member can create and edit entries
- Basic categorization (NPCs, Locations, Factions, History, Items)
- Internal linking between entries
- Search across all entries
- Edit history per entry
- Campaign-scoped

---

## Authentication

- Simple email + password accounts
- Passwords stored as bcrypt hashes (never plaintext)
- JWT handling via the `jose` library
- Token strategy: short-lived access tokens (15 min) + long-lived refresh tokens (30 days) stored in DynamoDB
  - Access token: sent in `Authorization` header, stateless validation
  - Refresh token: httpOnly cookie, stored hashed in DB, revocable
- Invite links for registration (multi-use, 7-day expiry, app-wide)
- Password reset via email link (AWS SES) — future

---

## Technical Stack

### Frontend
- **Framework:** React + TypeScript (Vite)
- **Type:** Progressive Web App (PWA) via vite-plugin-pwa
  - Service worker for offline support, caching, and push notifications
  - Web App Manifest for home screen installation
- **Hosting:** AWS S3 + CloudFront
- **Domain:** `grimoire.habernashing.com` via Route 53
- **HTTPS:** ACM certificate

### Backend
- **Compute:** AWS Lambda (Node.js 22, ESM, bundled with esbuild)
- **API:** AWS API Gateway HTTP API (WebSocket API added in Phase 6)
- **Auth:** Custom JWT-based auth (bcrypt via bcryptjs)
- **Push Notifications:** `web-push` library (VAPID), subscriptions in DynamoDB
- **File Storage:** AWS S3 (map images, character sheet PDFs, chat attachments)
- **Database:** AWS DynamoDB

### Infrastructure
- **IaC:** Terraform with S3 backend
- All resources defined as code
- Environments: `dev` and `prod` (separate state files)
- CI/CD: GitHub Actions (deploy on merge to main, plan on PR)

---

## DynamoDB Data Model

### Phase 1 (deployed)

| Table | PK | SK | GSIs | Notes |
|-------|----|----|------|-------|
| `users` | `userId` | — | `email-index` | email, passwordHash, name |
| `refresh_tokens` | `userId` | `tokenHash` | — | TTL on expiresAt |
| `push_subscriptions` | `userId` | `endpoint` | — | Web Push subscription data |
| `polls` | `pollId` | — | `status-index` | creatorId, mode, status, candidateDates |
| `responses` | `pollId` | `userId` | — | dates or availableDates, userName |
| `sessions` | `sessionId` | — | `date-index` (type + confirmedDate) | pollId, title |
| `invites` | `token` | — | — | TTL on expiresAt, multi-use |

### Phase 3 (campaigns)

| Table | PK | SK | GSIs | Notes |
|-------|----|----|------|-------|
| `campaigns` | `campaignId` | — | — | name, description, createdAt |
| `campaign_members` | `campaignId` | `userId` | `user-campaigns-index` (userId) | role (gm/player), joinedAt |

Existing tables gain `campaignId` attribute + GSIs as needed.

*Additional tables added per phase.*

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
| EventBridge | 1 | Scheduled reminder Lambda |
| S3 (media bucket) | 5+ | Map images, character PDFs, chat attachments |
| API Gateway (WebSocket) | 6 | Real-time chat connections |
| SES | Future | Password reset emails |

---

## CI/CD

- **Platform:** GitHub Actions
- **Frontend:** On push to `main`: build → S3 sync → CloudFront invalidation. On PR: build + typecheck.
- **Backend:** On push to `main`: esbuild bundle → zip → Lambda deploy. On PR: build check.
- **Infrastructure:** Terraform apply on merge to `main` (prod). Plan on PR (dev state).
- **Dev deploys:** `scripts/deploy-dev.sh [backend|frontend|infra|all]`
- **Secrets:** AWS credentials as GitHub Actions secrets
- **Versioning:** Git SHA + build timestamp injected at build time (esbuild --define for backend, Vite define for frontend)

---

## Non-Functional Requirements

- All traffic over HTTPS
- No third-party analytics or tracking
- Passwords never stored in plaintext
- Push notification subscriptions stored per user, deletable
- Offline read access for previously-viewed data (Phase 2+)

---

## Out of Scope

- OAuth / social login
- Native mobile app
- Dice roller
- Real-time collaborative map editing (GM controls pins)
- Video/voice chat
