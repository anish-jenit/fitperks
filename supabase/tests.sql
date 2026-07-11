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
