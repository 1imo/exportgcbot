# MTProto Moderator (TypeScript)

Single-codebase Telegram moderation runtime using:

- MTProto listener (GramJS)
- Management bot (Telegraf) for onboarding
- Deterministic auto-moderation flow (no AI)
- PostgreSQL persistence
- Composition root DI in `src/root.ts`

## Quick start

1. Copy `.env.example` to `.env` and fill required values.
2. Install dependencies: `npm install`
3. Start runtime: `npm run dev`
4. In Telegram, send `/start` to the mgmt bot and complete onboarding flow.
5. When prompted, open the secure auth link and submit login code / 2FA there.

## Ops scripts

- `npm run ops:create-db` initializes PostgreSQL tables from `assets/db.sql`.

## Core flow

1. User onboards via mgmt bot (phone -> login code -> optional 2FA password)
2. Session string is persisted per user
3. Incoming direct user message from MTProto (non-group/non-channel)
4. First message from a sender gets an auto-reply from `assets/messages/message.txt`
5. Second+ message from the same sender is automatically blocked
6. Mgmt bot notifies the onboarded client account so they can unblock if needed
