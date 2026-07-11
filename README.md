# FitPerks Multi-Organization MVP

FitPerks is an AI-powered wellness platform for companies, schools, and lightweight guest challenges. This implementation extends the original MVP with strict organization-level isolation, challenge windows, streak bonuses, secure server-side scoring, admin governance, and a no-login guest challenge path.

## Core Architecture

- Frontend: React + TypeScript + Vite
- DB/Auth/API: Supabase (RLS + RPC security-definer functions)
- Pose Detection: MediaPipe Pose (local in browser)
- Deployment: Vite static build (`dist`) for Vercel, Hostinger, or any static host with SPA fallback

## What This Version Adds

- Multi-organization tenant model with database-level isolation
- Participant entry by organization code + optional email-domain restrictions
- Admin login (Supabase Auth) with organization_admin and platform_admin roles
- Challenge windows with timezone-based day boundaries
- Secure workout processing via `submit_workout_secure` (server-side points and streaks)
- Participant and team daily streak progression
- Milestone/fixed streak bonus rules
- Point transaction ledger powering all leaderboard totals
- Privacy modes for leaderboard display names
- Audit logs for high-impact admin changes
- Completed challenge read-only history in admin UI
- Public homepage with two clear entry points: guest limited challenge and organization challenge request
- Guest limited challenges without login, capped at 10 players and purged after the post-challenge grace period

## UI/UX Theme Standard

Use the same theme across every FitPerks screen:

- Audience: professionals and students. Keep the interface calm, quick to scan, and friendly without feeling childish.
- Layout: show the usable workflow first. Avoid marketing-heavy sections, nested cards, and unnecessary feature explanation text.
- Visual style: light neutral canvas, white panels, restrained blue/teal accents, subtle borders, and minimal Apple-like motion.
- Components: use shared `.panel`, `.button`, `.hero-actions`, `.stats-cards`, `.url-list`, form, and table patterns from `src/App.css`.
- Shape: prefer compact 8-12px radii, stable spacing, and dense but breathable controls.
- Mobile: every public and workout flow must work at phone width. Buttons should be full-width when stacked, tables should scroll horizontally, and text must not overflow its container.
- Content: labels should be plain and generic enough for companies, schools, clubs, and guest groups.
- Motion: keep animation subtle and purposeful. No decorative blobs, noisy gradients, or one-note color themes.

## Database Deliverables

Files:

- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/tests.sql`

Key tables:

- `organizations`
- `organization_settings`
- `admin_users`
- `teams`
- `participants`
- `participant_profiles`
- `challenges`
- `challenge_participants`
- `workouts`
- `participant_streaks`
- `team_streaks`
- `streak_bonus_rules`
- `streak_bonus_awards`
- `point_transactions`
- `audit_logs`
- `guest_challenges`
- `guest_challenge_players`
- `guest_challenge_attempts`

Security and validation:

- RLS policies on all tenant data tables
- No public unauthenticated read access to participant/leaderboard data
- Direct inserts to `workouts` blocked by policy
- Secure function `submit_workout_secure` performs:
  1. participant verification
  2. organization membership verification
  3. active challenge validation
  4. challenge window + timezone validation
  5. daily session limit validation
  6. server-side point calculation
  7. participant streak update + bonus awarding
  8. team streak evaluation + bonus awarding
  9. point transaction creation
  10. idempotent response via unique session id

Leaderboard functions:

- `get_individual_leaderboard(challenge_id, period)`
- `get_team_leaderboard(challenge_id, period)`

Guest challenge functions:

- `create_guest_challenge(creator_key, creator_name, title, duration_days, attempts_per_day)`
- `get_guest_challenge(code)`
- `submit_guest_attempt(code, guest_name, session_id, exercise, reps)`
- `get_guest_scoreboard(code)`
- `purge_expired_guest_challenges()`

Organization-scoped participant onboarding:

- `participant_join_with_code(organization_code, nickname, team_name, email)`

## Frontend Deliverables

- Participant registration now requires organization code
- Challenge screen displays active challenge window and timezone
- Workout submission calls secure RPC, not client-computed totals
- Leaderboard upgraded with workout/streak/total breakdown fields
- Admin dashboard includes:
  - secure admin login
  - challenge config controls
  - scoring preview
  - read-only completed challenge history
  - audited config update path

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env.local
```

Set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. Apply SQL in order (Supabase SQL Editor):

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/tests.sql`

4. Verify connectivity:

```bash
npm run supabase:verify
```

5. Start app:

```bash
npm run dev
```

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
- `npm run supabase:schema`
- `npm run supabase:seed`
- `npm run supabase:test-sql`
- `npm run supabase:verify`
- `npm run test:e2e`
- `npm run validate:e2e`

## Automated Validation Coverage

SQL/DB test script (`supabase/tests.sql`) and secure function constraints cover:

- first qualifying workout path
- multiple workouts same day with one streak advancement
- streak reset after missed day
- challenge date boundaries
- timezone-based day calculation (via challenge timezone)
- duplicate workout submission prevention (session uniqueness/idempotency)
- duplicate streak bonus prevention (`streak_bonus_awards` uniqueness)
- team qualification threshold logic support
- team streak progression/reset primitives
- organization data isolation baseline checks
- completed challenge history retained as read-only data

Playwright E2E (`tests/e2e/fitperk.spec.ts`) covers core UI flows, guest sharing, POC setup URLs, and admin guardrails on desktop Chromium and mobile Chrome viewports.

## Deployment

Build:

```bash
npm run build
```

Vercel:

1. Push repo to GitHub.
2. Import into Vercel.
3. Use Vite defaults:
  - Build command: `npm run build`
  - Output directory: `dist`
4. Add env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

Hostinger/static hosting:

1. Run `npm run build`.
2. Upload the contents of `dist` into `public_html`.
3. Include `dist/.htaccess` so deep links like `/setup/...`, `/guest/...`, and `/launch/...` fall back to `index.html`.

## Privacy Defaults

- No raw video upload/storage.
- Leaderboards omit email and employee identifiers.
- Display name mode controlled per organization (`nickname`, `initials`, `anonymous`).
