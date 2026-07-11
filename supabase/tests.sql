-- Run after schema.sql and seed.sql. These SQL tests assert core isolation and streak rules.

-- NOTE: This test file intentionally uses explicit checks and raises exceptions on failure.

-- 1) Duplicate streak bonus prevention constraints exist.
do $$
begin
  if not exists (
    select 1 from pg_indexes where tablename = 'streak_bonus_awards'
  ) then
    raise exception 'streak_bonus_awards indexes not found';
  end if;
end $$;

-- 2) Ensure both organizations exist.
do $$
declare
  v_count int;
begin
  select count(*) into v_count from organizations where id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

  if v_count <> 2 then
    raise exception 'Seed organizations are missing';
  end if;
end $$;

-- 3) Challenge boundary check: end_date cannot be less than start_date.
do $$
begin
  begin
    insert into challenges (
      organization_id,
      name,
      description,
      start_date,
      end_date,
      timezone,
      status
    ) values (
      '11111111-1111-1111-1111-111111111111',
      'Invalid Window',
      'Should fail',
      now() + interval '2 day',
      now() + interval '1 day',
      'UTC',
      'upcoming'
    );
    raise exception 'Challenge boundary validation failed to reject invalid dates';
  exception when check_violation then
    null;
  end;
end $$;

-- 4) Duplicate workout session prevention (idempotency primitive uniqueness).
do $$
declare
  pid uuid := gen_random_uuid();
  tid uuid := '11111111-aaaa-aaaa-aaaa-111111111111';
  cid uuid := '11111111-cccc-cccc-cccc-111111111111';
  sid uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
begin
  insert into participants (id, organization_id, team_id, nickname)
  values (pid, '11111111-1111-1111-1111-111111111111', tid, 'SessionTester')
  on conflict do nothing;

  insert into workouts (organization_id, challenge_id, participant_id, team_id, session_id, exercise, reps)
  values ('11111111-1111-1111-1111-111111111111', cid, pid, tid, sid, 'squat', 10)
  on conflict do nothing;

  begin
    insert into workouts (organization_id, challenge_id, participant_id, team_id, session_id, exercise, reps)
    values ('11111111-1111-1111-1111-111111111111', cid, pid, tid, sid, 'squat', 12);
    raise exception 'Duplicate session_id insert should fail';
  exception when unique_violation then
    null;
  end;
end $$;

-- 5) Tenant data isolation sanity check (org-specific aggregate separation).
do $$
declare
  org_a_teams int;
  org_b_teams int;
begin
  select count(*) into org_a_teams from teams where organization_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into org_b_teams from teams where organization_id = '22222222-2222-2222-2222-222222222222';

  if org_a_teams = 0 or org_b_teams = 0 then
    raise exception 'Expected seeded teams for both organizations';
  end if;
end $$;

-- 6) POC URLs have matching backing records.
do $$
declare
  v_org_count int;
  v_invite_count int;
  v_public_context jsonb;
begin
  select count(*) into v_org_count
  from organizations
  where country_code = 'us'
    and slug = 'innoblaze'
    and organization_code = 'INNOBLAZE2026'
    and status = 'active';

  select count(*) into v_invite_count
  from organization_invites
  where token = 'INNOSETUP2026'
    and organization_id = '33333333-3333-3333-3333-333333333333'
    and status = 'pending'
    and expires_at > now();

  if v_org_count <> 1 or v_invite_count <> 1 then
    raise exception 'POC setup or launch fixture is missing';
  end if;

  v_public_context := get_public_launch_context('us', 'innoblaze');

  if v_public_context ->> 'setup_status' <> 'pending'
    or v_public_context ->> 'setup_url_path' <> '/setup/INNOSETUP2026' then
    raise exception 'POC launch fixture should report pending setup before acceptance';
  end if;
end $$;

-- 7) Invite setup completion can write challenge_status enum values.
do $$
declare
  v_result jsonb;
begin
  insert into organizations (id, name, slug, organization_code, country_code, allowed_email_domains, status)
  values (
    '44444444-4444-4444-4444-444444444444',
    'POC Test Org',
    'poc-test-org',
    'POCTEST2026',
    'us',
    '{}',
    'active'
  )
  on conflict (id) do update
  set name = excluded.name,
      slug = excluded.slug,
      organization_code = excluded.organization_code,
      country_code = excluded.country_code,
      allowed_email_domains = excluded.allowed_email_domains,
      status = excluded.status;

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
    'TESTSETUP2026',
    '44444444-4444-4444-4444-444444444444',
    'poc@test.example',
    'pending',
    now() + interval '1 day',
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

  v_result := complete_invite_setup(
    'TESTSETUP2026',
    'POC Test Org',
    'us',
    now() - interval '1 day',
    now() + interval '1 day',
    true,
    true,
    'Test invite setup completion'
  );

  if v_result ->> 'launch_url_path' <> '/launch/us/poc-test-org' then
    raise exception 'Invite setup completion returned unexpected launch URL';
  end if;
end $$;

-- 8) Guest challenge creation is login-free but limited to one active challenge per creator key.
do $$
declare
  v_result jsonb;
  v_code text;
  v_duplicate_rejected boolean := false;
begin
  delete from guest_challenges
  where creator_key_hash = encode(digest('guest-test-creator-key', 'sha256'), 'hex');

  v_result := create_guest_challenge(
    'guest-test-creator-key',
    'Maya',
    'Weekend Move Challenge',
    7,
    5
  );

  v_code := v_result ->> 'code';

  if v_result ->> 'creator_name' <> 'Maya'
    or (v_result ->> 'duration_days')::int <> 7
    or (v_result ->> 'attempts_per_day')::int <> 5
    or (v_result ->> 'max_players')::int <> 10 then
    raise exception 'Guest challenge creation returned unexpected configuration';
  end if;

  if (get_guest_challenge(v_code) ->> 'code') <> v_code then
    raise exception 'Guest challenge lookup did not return created challenge';
  end if;

  perform submit_guest_attempt(
    v_code,
    'Maya',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'high-knees',
    20
  );

  perform submit_guest_attempt(
    v_code,
    'Maya',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'lunges',
    10
  );

  begin
    perform create_guest_challenge(
      'guest-test-creator-key',
      'Maya',
      'Second Active Challenge',
      1,
      1
    );
  exception when others then
    v_duplicate_rejected := true;
  end;

  if not v_duplicate_rejected then
    raise exception 'Guest creator should not be able to create a second active challenge';
  end if;
end $$;
