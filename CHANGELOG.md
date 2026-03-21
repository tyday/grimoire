# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses phase-based versioning aligned with the roadmap.

## [0.6.0] - 2026-03-20

### Added
- Browse all public campaigns from a new "Browse All" page
- Self-join and leave campaigns (players only — GM cannot leave)
- Campaign detail page now shows upcoming and past sessions
- GM user picker to add registered users to a campaign
- `GET /campaigns/browse` endpoint for listing all public campaigns
- `POST /campaigns/:campaignId/join` and `/leave` endpoints
- `GET /users` endpoint for listing registered users
- `visibility` field on campaigns (default `public`, supports `private` for future use)
- DynamoDB `scan` helper in db.mjs
- Bruno collection for all campaign endpoints

### Changed
- `POST /campaigns/:campaignId/members` now restricted to GM only (was any member)
- `GET /campaigns/:campaignId` now returns sessions and allows non-member access to public campaigns
- Campaigns page header changed from "Campaigns" to "My Campaigns"

## [0.5.0] - 2026-03-19

### Added
- Session notes with markdown editing and preview
- One note per user per session (upsertable)
- Note content stored in `grimoire-session-notes` DynamoDB table

## [0.4.0] - 2026-03-18

### Added
- Multi-campaign support with campaign creation and switching
- Campaign members with GM/player roles
- Polls and sessions scoped to active campaign
- Campaign context persisted in localStorage

## [0.3.0] - 2026-03-17

### Added
- Runtime caching with Workbox for offline support
- Service worker caches API responses and static assets
- Offline detection with disabled form controls

## [0.2.0] - 2026-03-16

### Added
- Backend and frontend test suites

## [0.1.0] - 2026-03-15

### Added
- Terraform infra: S3, CloudFront, Lambda, API Gateway, DynamoDB, Route 53, ACM
- React PWA scaffold with Vite and vite-plugin-pwa
- GitHub Actions CI/CD (PR plan + deploy on merge to main)
- Auth system: JWT access tokens, httpOnly refresh cookies, invite links
- Scheduling polls: create, respond, confirm with candidate/open modes
- Web push notifications with VAPID
- Sessions with .ics calendar export and daily reminders
- Frontend UI for all features
- Invite link registration and PWA icons
- Info/versioning page with build metadata
- Bruno API collection
