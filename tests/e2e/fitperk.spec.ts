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
    access_duration_minutes: 30,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    entry_url_path: '/demo?code=trial-demo-1',
    workout_url_path: '/trial/trial-demo-1/workout',
    scoreboard_url_path: '/trial/trial-demo-1/scoreboard',
  }

  await page.route('http://127.0.0.1:54321/auth/v1/**', async (route) => {
    const request = route.request()
    const body = request.postData() ?? ''

    if (request.method() === 'POST' && body.includes('grant_type=password')) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: 'admin-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'admin-refresh',
          user: { id: 'admin-user-id' },
        }),
      })
    }

    if (request.method() === 'POST' && body.includes('grant_type=anon')) {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: 'anon-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'anon-refresh',
          user: { id: 'anon-user-id' },
        }),
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
      return json([])
    }

    if (path.endsWith('/rpc/get_individual_leaderboard') && method === 'POST') {
      return json(individualRows)
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
  await expect(page.getByRole('link', { name: 'Create Challenge' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Join Challenge' })).toHaveAttribute('href', '/join-challenge')
  await expect(page.getByRole('link', { name: 'Organization Challenge Request' })).toBeVisible()

  await page.goto('/launch/us/company-a')
  await expect(page.getByRole('heading', { name: 'Company A' })).toBeVisible()
  await page.getByRole('link', { name: 'Enter Challenge' }).click()
  await expect(page).toHaveURL(/\/challenges$/)
  await expect(page.getByRole('heading', { name: 'Choose a Challenge' })).toBeVisible()
  await expect(page.getByText(/to .*\(.+\)/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^(Let's Go|Start Now|Let's Move|Game On|Bring It On)$/ })).toHaveCount(4)

  await page.goto('/leaderboard')
  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overall' })).toBeVisible()
  await expect(page.locator('.winner-score').first()).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible()
})

test('guest limited challenge creates shareable challenge and scoreboard links', async ({ page }) => {
  await page.goto('/guest-challenge')

  await expect(page.getByRole('heading', { name: 'Create Challenge' })).toBeVisible()
  await page.getByLabel('Guest name').fill('Maya')
  await page.getByLabel('Email address').fill('maya@example.com')
  await page.getByRole('button', { name: 'Create Challenge' }).click()

  await expect(page.getByText('Guest name')).toBeVisible()
  await expect(page.getByText('Challenge code')).toBeVisible()
  await expect(page.getByText('Challenge URL')).toBeVisible()
  await expect(page.getByText('Scoreboard URL')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Open WhatsApp' })).toBeVisible()

  await page.goto('/join-challenge')
  await expect(page.getByRole('heading', { name: 'Join a Challenge' })).toBeVisible()
  await page.getByLabel('Email address').fill('ravi@example.com')
  await page.getByLabel('Guest name').fill('Ravi')
  await page.getByLabel('Challenge code').fill('weekend-move-abc123')
  await page.getByRole('button', { name: 'Find Challenges' }).click()
  await page.getByRole('button', { name: 'Join with code' }).click()
  await expect(page).toHaveURL(/\/guest\/weekend-move-abc123$/)
  await expect(page.getByRole('heading', { name: 'Weekend Move Challenge' })).toBeVisible()

  await page.goto('/guest/weekend-move-abc123')
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

test('organization request prepares email draft', async ({ page }) => {
  await page.goto('/organization-request')

  await expect(page.getByRole('heading', { name: 'Challenge Request' })).toBeVisible()
  await page.getByLabel('Organization', { exact: true }).fill('Acme Inc')
  await page.getByLabel('Contact name').fill('Alex')
  await page.getByLabel('Organization email').fill('alex@acme.com')
  await page.getByLabel('Country').fill('us')
  await page.getByLabel('Expected participants').fill('120')
  await page.getByRole('button', { name: 'Prepare Email' }).click()
  await expect(page.getByText('Email draft opened.')).toBeVisible()
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
  await expect(page.getByRole('link', { name: 'Start squats' })).toHaveAttribute(
    'href',
    '/trial/trial-demo-1/workout/squat?camera=1',
  )

  await page.goto('/trial/trial-demo-1/scoreboard')
  await expect(page.getByRole('heading', { name: 'Acme Wellness' })).toBeVisible()
  await expect(page.getByText('Waiting for the first workout')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open workout' })).toHaveAttribute('href', '/trial/trial-demo-1/workout')
})
