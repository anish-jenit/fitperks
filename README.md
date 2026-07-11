# FitPerks Multi-Organization MVP

FitPerks is an AI-powered wellness platform for companies and schools. This implementation extends the original MVP with strict organization-level isolation, challenge windows, streak bonuses, secure server-side scoring, and admin governance.

## Core Architecture

- Frontend: React + TypeScript + Vite
- DB/Auth/API: Supabase (RLS + RPC security-definer functions)
- Pose Detection: MediaPipe Pose (local in browser)
- Deployment: Vercel

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

Playwright E2E (`tests/e2e/fitperk.spec.ts`) covers core UI flows and admin guardrails.

## Deployment (Vercel)

1. Push repo to GitHub.
2. Import into Vercel.
3. Use Vite defaults:
  - Build command: `npm run build`
  - Output directory: `dist`
4. Add env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## Privacy Defaults

- No raw video upload/storage.
- Leaderboards omit email and employee identifiers.
- Display name mode controlled per organization (`nickname`, `initials`, `anonymous`).
