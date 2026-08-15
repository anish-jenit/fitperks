import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  let challenge = {
    id: 'challenge-1',
    organization_id: 'org-1',
    name: 'Company A Wellness Week',
    description: 'Seven day challenge',
    start_date: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    timezone: 'America/New_York',
    status: 'active',
    squat_points_per_rep: 1,
    burpee_points_per_rep: 2,
    high_knees_points_per_rep: 1,
    lunges_points_per_rep: 2,
    daily_streak_bonus: 0,
    team_streak_bonus: 0,
    max_sessions_per_day: 2,
    enabled_squat: true,
    enabled_burpee: true,
    enabled_high_knees: true,
    enabled_lunges: true,
    qualifying_threshold_type: 'total_points',
    qualifying_threshold_value: 10,
    team_qualification_type: 'fixed_count',
    team_required_unique_members: 3,
    team_required_participation_percent: 25,
    enable_ai_overlay: true,
    enable_ai_live_coach: false,
    enable_ai_announcer: false,
    enable_executive_summary: false,
    enable_celebration_animations: true,
    created_at: new Date().toISOString(),
  }

  const individualRows = [
    {
      participant_id: 'p-1',
      participant_name: 'ANISH',
      team_name: 'Blue Team',
      total_squats: 30,
      total_burpees: 10,
      total_high_knees: 24,
      total_lunges: 12,
      score: 50,
    },
  ]
  let guestChallenge = {
    id: 'guest-challenge-1',
    code: 'weekend-move-abc123',
    title: 'Weekend Move Challenge',
    creator_name: 'Maya',
    creator_email: 'maya@example.com',
    duration_days: 3,
    attempts_per_day: 3,
    max_players: 10,
    selected_exercises: ['squat', 'burpee'],
    session_duration_seconds: 60,
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    purge_after: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  }
  let innoBlazeSetupStatus: 'pending' | 'ready' = 'pending'
  const organizationTrial = {
    id: 'trial-1',
    code: 'trial-demo-1',
    organization_name: 'Acme Wellness',
    organization_code: 'ACME2026',
    country_code: 'us',
    display_message: 'A live FitPerks trial.',
    team_names: ['Blue Team'],
    enable_team_names: true,
    enable_nicknames: true,
    enable_ai_overlay: true,
    enable_ai_live_coach: false,
    enable_ai_announcer: false,
    enable_executive_summary: false,
    enable_celebration_animations: true,
    enable_ai_for_jj_squat_demo: true,
    enable_ai_for_plank_demo: true,
    access_duration_minutes: 30,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    entry_url_path: '/demo?code=trial-demo-1',
    workout_url_path: '/trial/trial-demo-1/workout',
    scoreboard_url_path: '/trial/trial-demo-1/scoreboard',
  }
  const organizationTrialScoreboard = [
    {
      rank: 1,
      display_name: 'Anish',
      team_name: 'Blue Team',
      squat_score: 20,
      jumping_jacks_score: 10,
      total_score: 30,
    },
  ]
  const soloProgress = {
    player_name: 'Maya',
    player_email: 'maya@example.com',
    current_streak: 2,
    longest_streak: 5,
    level: 1,
    badges: [],
    today_best_score: 42,
    today_max_reps: 42,
    total_attempts: 3,
    daily: [{ label: 'Aug 10', score: 42, max_reps: 42, active_days: 1 }],
    weekly: [{ label: 'W 08/10', score: 42, max_reps: 42, active_days: 1 }],
    monthly: [{ label: 'Aug', score: 42, max_reps: 42, active_days: 1 }],
    consistency_leaders: [{ rank: 1, player_name: 'Maya', player_email: 'maya@example.com', consistency_days: 2, max_reps: 42, best_daily_score: 42 }],
    max_rep_leaders: [{ rank: 1, player_name: 'Maya', player_email: 'maya@example.com', consistency_days: 2, max_reps: 42, best_daily_score: 42 }],
    daily_high_score_leaders: [{ rank: 1, player_name: 'Maya', player_email: 'maya@example.com', consistency_days: 1, max_reps: 42, best_daily_score: 42 }],
    weekly_high_score_leaders: [{ rank: 1, player_name: 'Maya', player_email: 'maya@example.com', consistency_days: 2, max_reps: 42, best_daily_score: 42 }],
    monthly_high_score_leaders: [{ rank: 1, player_name: 'Maya', player_email: 'maya@example.com', consistency_days: 2, max_reps: 42, best_daily_score: 42 }],
  }
  const platformUsageDashboard = {
    summary: {
      solo_attempts_total: 12,
      solo_attempts_today: 3,
      solo_attempts_this_week: 9,
      solo_attempts_this_month: 12,
      solo_players_total: 4,
      solo_flagged_total: 1,
      solo_flagged_unreviewed: 1,
      active_guest_challenges: 1,
      active_organization_trials: 1,
    },
    recent_flagged_attempts: [{
      id: 'flag-1',
      player_name: 'Maya',
      player_email: 'maya@example.com',
      exercise: 'push-ups',
      reps: 180,
      score: 180,
      flag_reasons: ['Rep count exceeds expected 60s range for push-ups'],
      reviewed_at: null,
      created_at: new Date().toISOString(),
    }],
    monthly_winner: {
      month_start: new Date().toISOString().slice(0, 8) + '01',
      player_name: 'Maya',
      player_email: 'maya@example.com',
      exercise: 'push-ups',
      reps: 42,
      score: 42,
      status: 'pending',
      voucher_code: null,
      awarded_at: null,
    },
  }

  await page.route('http://127.0.0.1:54321/auth/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const body = request.postData() ?? ''

    if (request.method() === 'POST' && (body.includes('grant_type=password') || url.searchParams.get('grant_type') === 'password')) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: 'admin-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'admin-refresh',
          user: { id: 'admin-user-id', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com' },
        }),
      })
    }

    if (request.method() === 'POST' && (body.includes('grant_type=anon') || url.searchParams.get('grant_type') === 'anon')) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: 'anon-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'anon-refresh',
          user: { id: 'anon-user-id', aud: 'authenticated', role: 'authenticated' },
        }),
      })
    }

    if (request.method() === 'GET' && request.headers().authorization?.includes('admin-token')) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'admin-user-id', email: 'admin@example.com' }),
      })
    }

    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: null }),
    })
  })

  await page.route('http://127.0.0.1:54321/rest/v1/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const path = url.pathname

    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })

    if (path.endsWith('/rpc/participant_join_with_code') && method === 'POST') {
      return json({
        participant_id: 'p-1',
        organization_id: 'org-1',
        organization_name: 'Company A',
        team_id: 't-1',
        team_name: 'Blue Team',
        nickname: 'Anish',
      })
    }

    if (path.endsWith('/rpc/get_active_challenge_for_org') && method === 'POST') {
      return json(challenge)
    }

    if (path.endsWith('/rpc/get_active_challenge_by_code') && method === 'POST') {
      return json(challenge)
    }

    if (path.endsWith('/rpc/get_public_launch_context') && method === 'POST') {
      const body = request.postDataJSON() as { p_country_code?: string; p_organization_slug?: string }
      if (body.p_country_code === 'us' && body.p_organization_slug === 'innoblaze') {
        return json({
          organization_id: 'org-innoblaze',
          organization_name: 'InnoBlaze',
          organization_slug: 'innoblaze',
          country_code: 'us',
          organization_code: 'INNOBLAZE2026',
          display_message: 'Welcome to the InnoBlaze commute challenge.',
          setup_status: innoBlazeSetupStatus,
          setup_url_path: innoBlazeSetupStatus === 'pending' ? '/setup/INNOSETUP2026' : null,
        })
      }

      if (body.p_country_code === 'us' && body.p_organization_slug === 'pending-co') {
        return json({
          organization_id: 'org-pending',
          organization_name: 'Pending Co',
          organization_slug: 'pending-co',
          country_code: 'us',
          organization_code: 'PENDING2026',
          display_message: 'Setup is almost there.',
          setup_status: 'pending',
          setup_url_path: '/setup/PENDING2026',
        })
      }

      return json({
        organization_id: 'org-1',
        organization_name: 'Company A',
        organization_slug: 'company-a',
        country_code: 'us',
        organization_code: 'COMPANYA2026',
        display_message: 'Welcome to Company A Challenge Week',
        setup_status: 'ready',
        setup_url_path: null,
      })
    }

    if (path.endsWith('/rpc/get_current_admin_user') && method === 'POST') {
      return json({ id: 'admin-1', organization_id: null, user_id: 'admin-user-id', role: 'platform_admin', created_at: new Date().toISOString() })
    }

    if (path.endsWith('/rpc/get_invite_setup_context') && method === 'POST') {
      return json({
        token: 'INNOSETUP2026',
        organization_id: 'org-innoblaze',
        organization_name: 'InnoBlaze',
        organization_slug: 'innoblaze',
        organization_code: 'INNOBLAZE2026',
        country_code: 'us',
        poc_email: 'poc@innoblaze.test',
        existing_challenge_id: 'challenge-innoblaze',
        existing_challenge_name: 'InnoBlaze Commute Challenge',
      })
    }

    if (path.endsWith('/rpc/complete_invite_setup') && method === 'POST') {
      innoBlazeSetupStatus = 'ready'
      return json({ launch_url_path: '/launch/us/innoblaze' })
    }

    if (path.endsWith('/rpc/create_guest_challenge') && method === 'POST') {
      const body = request.postDataJSON() as {
        p_creator_name?: string
        p_creator_email?: string
        p_title?: string
        p_duration_days?: number
        p_attempts_per_day?: number
        p_selected_exercises?: string[]
        p_session_duration_seconds?: number
      }
      guestChallenge = {
        ...guestChallenge,
        title: body.p_title || guestChallenge.title,
        creator_name: body.p_creator_name || guestChallenge.creator_name,
        creator_email: body.p_creator_email || guestChallenge.creator_email,
        duration_days: body.p_duration_days || guestChallenge.duration_days,
        attempts_per_day: body.p_attempts_per_day || guestChallenge.attempts_per_day,
        selected_exercises: body.p_selected_exercises || guestChallenge.selected_exercises,
        session_duration_seconds: body.p_session_duration_seconds || guestChallenge.session_duration_seconds,
      }
      return json(guestChallenge)
    }

    if (path.endsWith('/rpc/get_guest_challenges_for_email') && method === 'POST') {
      return json([{ ...guestChallenge, player_count: 1, joined: false }])
    }

    if (path.endsWith('/rpc/get_guest_challenge') && method === 'POST') {
      return json(guestChallenge)
    }

    if (path.endsWith('/rpc/get_guest_scoreboard') && method === 'POST') {
      return json([])
    }

    if (path.endsWith('/rpc/get_organization_trial') && method === 'POST') {
      return json(organizationTrial)
    }

    if (path.endsWith('/rpc/get_organization_trial_scoreboard') && method === 'POST') {
      return json(organizationTrialScoreboard)
    }

    if (path.endsWith('/rpc/get_organization_trial_score_summary') && method === 'POST') {
      return json({ best_score: 20, best_team_score: 30 })
    }

    if (path.endsWith('/rpc/submit_organization_trial_result') && method === 'POST') {
      return json({ attempt_id: 'trial-attempt-1', score: 20 })
    }

    if (path.endsWith('/rpc/get_individual_leaderboard') && method === 'POST') {
      return json(individualRows)
    }

    if (path.endsWith('/rpc/get_solo_progress') && method === 'POST') {
      return json(soloProgress)
    }

    if (path.endsWith('/rpc/get_platform_usage_dashboard') && method === 'POST') {
      return json(platformUsageDashboard)
    }

    if (path.endsWith('/rpc/refresh_solo_monthly_winner') && method === 'POST') {
      return json(platformUsageDashboard.monthly_winner)
    }

    if (path.endsWith('/rpc/submit_workout_secure') && method === 'POST') {
      return json({ workout_id: 'w-1', idempotent: false, points_added: 10, qualifying: true })
    }

    if (path.endsWith('/rpc/write_audit_log') && method === 'POST') {
      return json(null)
    }

    if (path.endsWith('/admin_users') && method === 'GET') {
      return json([{ id: 'a-1', organization_id: 'org-1', user_id: 'admin-user-id', role: 'organization_admin' }])
    }

    if (path.endsWith('/challenges') && method === 'GET') {
      return json([challenge])
    }

    if (path.endsWith('/challenges') && method === 'PATCH') {
      const patch = request.postDataJSON() as Record<string, unknown>
      challenge = { ...challenge, ...patch }
      return json([challenge])
    }

    return json([])
  })

  await page.route('http://127.0.0.1:54321/realtime/**', async (route) => {
    await route.fulfill({ status: 101, body: '' })
  })
})

test('launch start, challenge list, leaderboards, and admin login render correctly', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Every Move Deserves a Perk.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Play Solo' })).toHaveAttribute('href', '/solo')
  await expect(page.getByRole('link', { name: 'Create / Join Challenge' })).toHaveAttribute('href', '/guest-challenge')
  await expect(page.getByRole('link', { name: 'Org Demo' })).toHaveAttribute('href', '/demo')

  await page.goto('/launch/us/company-a')
  await expect(page.getByRole('heading', { name: 'Company A' })).toBeVisible()
  await page.getByRole('link', { name: 'Enter Challenge' }).click()
  await expect(page).toHaveURL(/\/challenges$/)
  await expect(page.getByRole('heading', { name: 'Choose a Challenge' })).toBeVisible()
  await expect(page.getByText(/to .*\(.+\)/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^Start (Squat|Jumping Jack|High Knees|Lunge)$/ })).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Start Squat' })).toHaveAttribute('href', '/workout/squat')
  await expect(page.getByRole('link', { name: 'Start Jumping Jack' })).toHaveAttribute('href', '/workout/burpee')

  await page.goto('/leaderboard')
  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overall' })).toBeVisible()
  await expect(page.locator('.winner-score').first()).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
})

test('solo mode exposes push-ups and period high scorers', async ({ page }) => {
  await page.goto('/solo?email=maya@example.com')

  await expect(page.getByRole('heading', { name: 'Your daily best counts.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Push-Up' })).toHaveAttribute('href', '/solo/workout/push-ups')
  await expect(page.getByRole('heading', { name: 'Daily High Score' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Weekly High Score' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Monthly High Score' })).toBeVisible()
  await expect(page.getByText('42 pts')).toHaveCount(3)
})

test('platform admin can inspect usage and anti-cheat guardrails', async ({ page }) => {
  await page.goto('/admin')

  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Platform Admin Dashboard' })).toBeVisible()

  await page.getByRole('tab', { name: 'Usage & Guardrails' }).click()
  await expect(page.getByRole('heading', { name: 'Usage & Guardrails' })).toBeVisible()
  await expect(page.getByText('Unreviewed flags')).toBeVisible()
  await expect(page.getByText('Monthly reward candidate')).toBeVisible()
  await expect(page.getByText('Recent suspicious solo attempts')).toBeVisible()
  await expect(page.getByText('Rep count exceeds expected 60s range for push-ups')).toBeVisible()
})

test('guest limited challenge creates shareable challenge and scoreboard links', async ({ page }) => {
  await page.goto('/guest-challenge')

  await expect(page.getByRole('heading', { name: 'Create / Join Challenge' })).toBeVisible()
  await page.getByLabel('Player name').fill('Maya')
  await page.getByLabel('Email address').fill('maya@example.com')
  await page.getByRole('button', { name: 'Create Challenge' }).click()

  await expect(page.locator('.copy-card').filter({ hasText: 'Challenge code' })).toBeVisible()
  await expect(page.getByText('Challenge URL')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Open WhatsApp' })).toBeVisible()

  await page.goto('/join-challenge')
  await expect(page.getByRole('heading', { name: 'Create / Join Challenge' })).toBeVisible()
  await page.getByLabel('Email address').fill('ravi@example.com')
  await page.getByLabel('Player name').fill('Ravi')
  await page.getByLabel('Challenge code').fill('weekend-move-abc123')
  await page.getByRole('button', { name: 'Find Challenges' }).click()
  await page.getByRole('button', { name: 'Join with code' }).click()
  await expect(page).toHaveURL(/\/guest\/weekend-move-abc123$/)
  await expect(page.getByRole('heading', { name: 'Weekend Move Challenge' })).toBeVisible()
  await expect(page.getByText('WEEKEND-MOVE-ABC123')).toBeVisible()

  await page.goto('/guest/weekend-move-abc123')
  await expect(page.getByText('WEEKEND-MOVE-ABC123')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Squat' })).toHaveAttribute('href', '/guest/weekend-move-abc123/workout/squat')
  await expect(page.getByRole('link', { name: 'Jumping Jack' })).toHaveAttribute(
    'href',
    '/guest/weekend-move-abc123/workout/burpee',
  )

  await page.goto('/guest/weekend-move-abc123/scoreboard')
  await expect(page.getByRole('main').getByText('Scoreboard', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Weekend Move Challenge' })).toBeVisible()
  await expect(page.getByText('Waiting for players')).toBeVisible()
})

test('mobile workout camera keeps score entry out of the camera view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/guest/weekend-move-abc123/workout/squat')

  const camera = page.locator('.camera-wrapper')
  await expect(camera).toBeVisible()
  await expect(page.locator('.workout-score-overlay')).toHaveCount(0)
  await expect(page.locator('.camera-feed')).toHaveCSS('object-fit', 'contain')

  const cameraBox = await camera.boundingBox()
  expect(cameraBox?.height ?? 0).toBeGreaterThan(500)
})

test('organization request handles missing email service', async ({ page }) => {
  await page.goto('/organization-request')

  await expect(page.getByRole('heading', { name: 'Challenge Request' })).toBeVisible()
  await page.getByLabel('Organization', { exact: true }).fill('Acme Inc')
  await page.getByLabel('Contact name').fill('Alex')
  await page.getByLabel('Organization email').fill('alex@acme.com')
  await page.getByLabel('Country').fill('us')
  await page.getByLabel('Expected participants').fill('120')
  await page.getByRole('button', { name: 'Submit Request' }).click()
  await expect(page.getByText('Failed to send a request to the Edge Function')).toBeVisible()
})

test('ready public challenge URL links to challenge selection', async ({ page }) => {
  await page.goto('/launch/us/company-a')

  await expect(page.getByRole('heading', { name: 'Company A' })).toBeVisible()
  await page.getByRole('link', { name: 'Enter Challenge' }).click()
  await expect(page).toHaveURL(/\/challenges$/)
  await expect(page.getByRole('heading', { name: 'Choose a Challenge' })).toBeVisible()
})

test('pending public challenge URL explains setup is not ready yet', async ({ page }) => {
  await page.goto('/launch/us/pending-co')

  await expect(page.getByRole('heading', { name: 'Pending Co' })).toBeVisible()
  await expect(page.getByText(/Setup is still warming up/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Finish Setup' })).toHaveAttribute('href', '/setup/PENDING2026')
})

test('POC setup, launch, and scoreboard URLs resolve', async ({ page }) => {
  await page.goto('/setup/INNOSETUP2026')

  await expect(page.getByRole('heading', { name: 'Organization Setup' })).toBeVisible()
  await expect(page.getByLabel('Organization')).toHaveValue('InnoBlaze')
  await page.getByRole('button', { name: 'Complete Setup' }).click()
  await expect(page.getByRole('link', { name: /\/setup\/INNOSETUP2026$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /\/launch\/us\/innoblaze$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /\/launch\/us\/innoblaze\/leaderboard$/ })).toBeVisible()
  await expect(page.getByText('Challenge URL', { exact: true })).toBeVisible()
  await expect(page.getByText('Scoreboard URL', { exact: true })).toBeVisible()

  await page.goto('/launch/us/innoblaze')
  await expect(page.getByRole('heading', { name: 'InnoBlaze' })).toBeVisible()
  await page.getByRole('link', { name: 'Enter Challenge' }).click()
  await expect(page).toHaveURL(/\/challenges$/)
  await expect(page.getByRole('heading', { name: 'Choose a Challenge' })).toBeVisible()

  await page.goto('/launch/us/innoblaze/leaderboard')
  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible()
})

test('organization trial entry, workout, and scoreboard links resolve', async ({ page }) => {
  await page.goto('/demo?code=trial-demo-1')

  await expect(page.getByRole('heading', { name: 'Enter trial code' })).toBeVisible()
  await page.getByRole('button', { name: 'Open demo' }).click()
  await expect(page).toHaveURL(/\/trial\/trial-demo-1$/)
  await expect(page.getByRole('heading', { name: 'Acme Wellness' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open quick-start workout' })).toHaveAttribute('href', '/trial/trial-demo-1/workout')
  await expect(page.getByRole('link', { name: 'Open live scoreboard' })).toHaveAttribute('href', '/trial/trial-demo-1/scoreboard')

  await page.getByRole('link', { name: 'Open quick-start workout' }).click()
  await expect(page).toHaveURL(/\/trial\/trial-demo-1\/workout$/)
  await expect(page.getByRole('link', { name: 'Start demo' })).toHaveAttribute(
    'href',
    '/trial/trial-demo-1/workout/burpee?camera=1',
  )

  await page.goto('/trial/trial-demo-1/scoreboard')
  await expect(page.getByRole('heading', { name: 'Acme Wellness' })).toBeVisible()
  await expect(page.getByText('Anish')).toBeVisible()
  await expect(page.getByText('Blue Team · SQ 20 · JJ 10')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open workout' })).toHaveAttribute('href', '/trial/trial-demo-1/workout')
})
