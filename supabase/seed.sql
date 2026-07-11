-- Seed for organizations with isolation-friendly sample data and a POC launch fixture.
insert into organizations (id, name, slug, organization_code, country_code, poc_email, allowed_email_domains, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Company A', 'company-a', 'COMPANYA2026', 'us', null, array['companya.com'], 'active'),
  ('22222222-2222-2222-2222-222222222222', 'School B', 'school-b', 'SCHOOLB2026', 'us', null, array['schoolb.edu'], 'active'),
  ('33333333-3333-3333-3333-333333333333', 'InnoBlaze', 'innoblaze', 'INNOBLAZE2026', 'us', 'poc@innoblaze.test', '{}', 'active')
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    organization_code = excluded.organization_code,
    country_code = excluded.country_code,
    poc_email = excluded.poc_email,
    allowed_email_domains = excluded.allowed_email_domains,
    status = excluded.status;

insert into organization_settings (organization_id, leaderboard_privacy_mode)
values
  ('11111111-1111-1111-1111-111111111111', 'nickname'),
  ('22222222-2222-2222-2222-222222222222', 'initials'),
  ('33333333-3333-3333-3333-333333333333', 'nickname')
on conflict (organization_id) do update
set leaderboard_privacy_mode = excluded.leaderboard_privacy_mode,
    updated_at = now();

insert into teams (id, organization_id, name)
values
  ('11111111-aaaa-aaaa-aaaa-111111111111', '11111111-1111-1111-1111-111111111111', 'A-Engineering'),
  ('11111111-bbbb-bbbb-bbbb-111111111111', '11111111-1111-1111-1111-111111111111', 'A-Sales'),
  ('22222222-aaaa-aaaa-aaaa-222222222222', '22222222-2222-2222-2222-222222222222', 'B-Grade-10'),
  ('22222222-bbbb-bbbb-bbbb-222222222222', '22222222-2222-2222-2222-222222222222', 'B-Grade-11'),
  ('33333333-aaaa-aaaa-aaaa-333333333333', '33333333-3333-3333-3333-333333333333', 'InnoBlaze-Ops'),
  ('33333333-bbbb-bbbb-bbbb-333333333333', '33333333-3333-3333-3333-333333333333', 'InnoBlaze-Sales')
on conflict (id) do update
set organization_id = excluded.organization_id,
    name = excluded.name;

insert into challenges (
  id,
  organization_id,
  name,
  description,
  start_date,
  end_date,
  timezone,
  status,
  squat_points_per_rep,
  burpee_points_per_rep,
  max_sessions_per_day,
  qualifying_threshold_type,
  qualifying_threshold_value,
  team_qualification_type,
  team_required_unique_members,
  team_required_participation_percent
)
values
  (
    '11111111-cccc-cccc-cccc-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Company A Wellness Week',
    'Seven day engagement challenge',
    date_trunc('day', now()) - interval '1 day',
    date_trunc('day', now()) + interval '14 day',
    'America/New_York',
    'active',
    1,
    2,
    3,
    'total_points',
    10,
    'fixed_count',
    3,
    25
  ),
  (
    '22222222-cccc-cccc-cccc-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'School B Fitness Sprint',
    'Daily class challenge',
    date_trunc('day', now()) - interval '1 day',
    date_trunc('day', now()) + interval '14 day',
    'America/Chicago',
    'active',
    1,
    2,
    2,
    'squats',
    10,
    'percentage',
    3,
    25
  ),
  (
    '33333333-cccc-cccc-cccc-333333333333',
    '33333333-3333-3333-3333-333333333333',
    'InnoBlaze Commute Challenge',
    'Welcome to the InnoBlaze commute challenge. Complete your reps and climb the leaderboard.',
    date_trunc('day', now()) - interval '1 day',
    date_trunc('day', now()) + interval '14 day',
    'America/New_York',
    'active',
    1,
    2,
    3,
    'total_points',
    10,
    'fixed_count',
    3,
    25
  )
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    timezone = excluded.timezone,
    status = excluded.status,
    max_sessions_per_day = excluded.max_sessions_per_day,
    qualifying_threshold_type = excluded.qualifying_threshold_type,
    qualifying_threshold_value = excluded.qualifying_threshold_value;

insert into organization_invites (
  token,
  organization_id,
  poc_email,
  status,
  expires_at,
  accepted_at,
  created_by_user_id
)
values (
  'INNOSETUP2026',
  '33333333-3333-3333-3333-333333333333',
  'poc@innoblaze.test',
  'pending',
  now() + interval '30 days',
  null,
  null
)
on conflict (token) do update
set organization_id = excluded.organization_id,
    poc_email = excluded.poc_email,
    status = excluded.status,
    expires_at = excluded.expires_at,
    accepted_at = excluded.accepted_at,
    created_by_user_id = excluded.created_by_user_id;

insert into streak_bonus_rules (organization_id, challenge_id, target_type, rule_type, streak_day, bonus_points)
values
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'participant', 'milestone', 2, 5),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'participant', 'milestone', 3, 10),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'participant', 'milestone', 5, 20),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'participant', 'milestone', 7, 40),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'team', 'milestone', 2, 20),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'team', 'milestone', 3, 50),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'team', 'milestone', 5, 100),
  ('11111111-1111-1111-1111-111111111111', '11111111-cccc-cccc-cccc-111111111111', 'team', 'milestone', 7, 200)
on conflict do nothing;
