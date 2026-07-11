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
    daily_streak_bonus: 0,
    team_streak_bonus: 0,
    max_sessions_per_day: 2,
    enabled_squat: true,
    enabled_burpee: true,
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
      score: 50,
    },
  ]

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
      return json({
        organization_id: 'org-1',
        organization_name: 'Company A',
        organization_slug: 'company-a',
        country_code: 'us',
        organization_code: 'COMPANYA2026',
        display_message: 'Welcome to Company A Challenge Week',
      })
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

test('BAU registration, challenge list, leaderboards, and admin dashboard render correctly', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Participant Registration' })).toBeVisible()
  await page.getByLabel('Organization code').fill('COMPANYA2026')
  await page.getByLabel('Name or nickname').fill('Anish')
  await page.getByLabel('Team name').fill('Blue Team')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Choose a Challenge' })).toBeVisible()
  await expect(page.getByText(/to .*\(.+\)/)).toBeVisible()
  await expect(page.getByRole('link', { name: /^(Let's Go|Start Now|Let's Move|Game On|Bring It On)$/ })).toHaveCount(2)

  await page.goto('/leaderboard')
  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Overall' })).toBeVisible()

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Organization Admin Dashboard' })).toBeVisible()
})

test('public organization launch URL shows primary start and separate leaderboard button', async ({ page }) => {
  await page.goto('/launch/us/company-a')

  await expect(page.getByRole('heading', { name: 'Company A' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View Leaderboard' })).toBeVisible()

  await page.getByRole('link', { name: 'View Leaderboard' }).click()
  await expect(page.getByRole('heading', { name: 'Leaderboards' })).toBeVisible()
})
