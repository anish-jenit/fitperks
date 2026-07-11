create extension if not exists "pgcrypto";

do $$ begin
  create type challenge_status as enum ('upcoming', 'active', 'completed', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type organization_status as enum ('active', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type admin_role as enum ('organization_admin', 'platform_admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type streak_bonus_rule_type as enum ('milestone', 'fixed_daily_after_min');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type streak_target_type as enum ('participant', 'team');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type transaction_type as enum ('workout', 'participant_streak_bonus', 'team_streak_bonus', 'admin_adjustment');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type privacy_mode as enum ('nickname', 'initials', 'anonymous');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type qualifying_threshold_type as enum ('squats', 'burpees', 'high_knees', 'lunges', 'total_points');
exception when duplicate_object then null;
end $$;

alter type qualifying_threshold_type add value if not exists 'high_knees';
alter type qualifying_threshold_type add value if not exists 'lunges';

do $$ begin
  create type team_qualification_type as enum ('fixed_count', 'percentage');
exception when duplicate_object then null;
end $$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  organization_code text not null unique,
  country_code text not null default 'us',
  poc_email text,
  allowed_email_domains text[] not null default '{}',
  status organization_status not null default 'active',
  created_at timestamptz not null default now()
);

alter table organizations add column if not exists country_code text not null default 'us';
alter table organizations add column if not exists poc_email text;

create table if not exists organization_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  leaderboard_privacy_mode privacy_mode not null default 'nickname',
  allow_pose_recording boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  poc_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table organization_invites alter column created_by_user_id drop not null;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role admin_role not null,
  created_at timestamptz not null default now(),
  check ((role = 'platform_admin' and organization_id is null) or (role = 'organization_admin' and organization_id is not null))
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  nickname text not null,
  email text,
  display_alias text,
  created_at timestamptz not null default now()
);

create table if not exists participant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  participant_id uuid not null unique references participants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  start_date timestamptz not null,
  end_date timestamptz not null,
  timezone text not null,
  status challenge_status not null default 'upcoming',
  squat_points_per_rep int not null default 1,
  burpee_points_per_rep int not null default 2,
  high_knees_points_per_rep int not null default 1,
  lunges_points_per_rep int not null default 2,
  daily_streak_bonus int not null default 0,
  team_streak_bonus int not null default 0,
  max_sessions_per_day int not null default 3,
  enabled_squat boolean not null default true,
  enabled_burpee boolean not null default true,
  enabled_high_knees boolean not null default true,
  enabled_lunges boolean not null default true,
  qualifying_threshold_type qualifying_threshold_type not null default 'total_points',
  qualifying_threshold_value int not null default 10,
  team_qualification_type team_qualification_type not null default 'fixed_count',
  team_required_unique_members int not null default 3,
  team_required_participation_percent numeric(5,2) not null default 25,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table challenges add column if not exists high_knees_points_per_rep int not null default 1;
alter table challenges add column if not exists lunges_points_per_rep int not null default 2;
alter table challenges add column if not exists enabled_high_knees boolean not null default true;
alter table challenges add column if not exists enabled_lunges boolean not null default true;

create table if not exists challenge_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (challenge_id, participant_id)
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  team_id uuid not null references teams(id) on delete restrict,
  session_id uuid not null,
  exercise text not null check (exercise in ('squat', 'burpee', 'high-knees', 'lunges')),
  reps int not null check (reps >= 0),
  qualifying boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, challenge_id, participant_id, session_id)
);

alter table workouts drop constraint if exists workouts_exercise_check;
alter table workouts add constraint workouts_exercise_check check (exercise in ('squat', 'burpee', 'high-knees', 'lunges'));

create table if not exists participant_streaks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_qualified_date date,
  total_streak_bonus int not null default 0,
  updated_at timestamptz not null default now(),
  unique (challenge_id, participant_id)
);

create table if not exists team_streaks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_qualified_date date,
  total_streak_bonus int not null default 0,
  updated_at timestamptz not null default now(),
  unique (challenge_id, team_id)
);

create table if not exists streak_bonus_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  target_type streak_target_type not null default 'participant',
  rule_type streak_bonus_rule_type not null,
  streak_day int not null,
  bonus_points int not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, target_type, rule_type, streak_day)
);

create table if not exists streak_bonus_awards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  rule_id uuid not null references streak_bonus_rules(id) on delete cascade,
  streak_day int not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, participant_id, rule_id, streak_day),
  unique (challenge_id, team_id, rule_id, streak_day)
);

create table if not exists point_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  participant_id uuid references participants(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  transaction_type transaction_type not null,
  source_id uuid,
  points int not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists guest_challenges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  creator_name text not null,
  creator_key_hash text not null,
  duration_days int not null check (duration_days between 1 and 7),
  attempts_per_day int not null check (attempts_per_day between 1 and 5),
  max_players int not null default 10 check (max_players between 1 and 10),
  start_date timestamptz not null default now(),
  end_date timestamptz not null,
  purge_after timestamptz not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date >= start_date),
  check (purge_after >= end_date)
);

create table if not exists guest_challenge_players (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references guest_challenges(id) on delete cascade,
  guest_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists guest_challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references guest_challenges(id) on delete cascade,
  player_id uuid not null references guest_challenge_players(id) on delete cascade,
  session_id uuid not null,
  exercise text not null check (exercise in ('squat', 'burpee', 'high-knees', 'lunges')),
  reps int not null check (reps >= 0),
  score int not null check (score >= 0),
  created_at timestamptz not null default now(),
  unique (challenge_id, player_id, session_id)
);

alter table guest_challenge_attempts drop constraint if exists guest_challenge_attempts_exercise_check;
alter table guest_challenge_attempts add constraint guest_challenge_attempts_exercise_check check (exercise in ('squat', 'burpee', 'high-knees', 'lunges'));

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_participants_org on participants(organization_id);
create unique index if not exists idx_participants_org_email_unique on participants(organization_id, lower(email)) where email is not null;
create index if not exists idx_teams_org on teams(organization_id);
create index if not exists idx_workouts_org_challenge_created on workouts(organization_id, challenge_id, created_at desc);
create index if not exists idx_point_tx_org_challenge_created on point_transactions(organization_id, challenge_id, created_at desc);
create index if not exists idx_challenges_org_status on challenges(organization_id, status);
create index if not exists idx_organization_invites_token on organization_invites(token);
create index if not exists idx_guest_challenges_code on guest_challenges(code);
create index if not exists idx_guest_challenges_creator_active on guest_challenges(creator_key_hash, end_date) where deleted_at is null;
create index if not exists idx_guest_challenge_players_challenge on guest_challenge_players(challenge_id);
create unique index if not exists idx_guest_challenge_players_name_unique on guest_challenge_players(challenge_id, lower(guest_name));
create index if not exists idx_guest_challenge_attempts_challenge_created on guest_challenge_attempts(challenge_id, created_at desc);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'organization_id', '')::uuid
$$;

create or replace function public.current_admin_role()
returns admin_role
language sql
stable
as $$
  select au.role from admin_users au where au.user_id = auth.uid() limit 1
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from admin_users au where au.user_id = auth.uid() and au.role = 'platform_admin'
  )
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from admin_users au where au.user_id = auth.uid() and au.role = 'organization_admin' and au.organization_id = org_id
  )
$$;

create or replace function public.current_participant_id()
returns uuid
language sql
stable
as $$
  select pp.participant_id from participant_profiles pp where pp.user_id = auth.uid() limit 1
$$;

create or replace function public.participant_join_with_code(
  p_organization_code text,
  p_nickname text,
  p_team_name text,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations%rowtype;
  v_team teams%rowtype;
  v_participant participants%rowtype;
  v_domain text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_org
  from organizations
  where organization_code = p_organization_code and status = 'active'
  limit 1;

  if v_org.id is null then
    raise exception 'Invalid organization code';
  end if;

  v_email := nullif(lower(trim(p_email)), '');

  if v_email is not null and array_length(v_org.allowed_email_domains, 1) is not null then
    v_domain := split_part(v_email, '@', 2);
    if not (v_domain = any(v_org.allowed_email_domains)) then
      raise exception 'Email domain is not allowed for this organization';
    end if;
  elsif v_email is null and array_length(v_org.allowed_email_domains, 1) is not null then
    raise exception 'Email is required for this organization';
  end if;

  insert into teams (organization_id, name)
  values (v_org.id, trim(p_team_name))
  on conflict (organization_id, name) do update set name = excluded.name
  returning * into v_team;

  if v_email is not null then
    select * into v_participant
    from participants
    where organization_id = v_org.id
      and lower(email) = v_email
    limit 1;
  end if;

  if v_participant.id is null then
    insert into participants (organization_id, team_id, nickname, email)
    values (v_org.id, v_team.id, trim(p_nickname), v_email)
    returning * into v_participant;
  else
    update participants
    set team_id = v_team.id,
        nickname = trim(p_nickname),
        email = v_email
    where id = v_participant.id
    returning * into v_participant;
  end if;

  insert into participant_profiles (user_id, organization_id, participant_id)
  values (auth.uid(), v_org.id, v_participant.id)
  on conflict (user_id)
  do update set
    organization_id = excluded.organization_id,
    participant_id = excluded.participant_id;

  return jsonb_build_object(
    'participant_id', v_participant.id,
    'organization_id', v_org.id,
    'team_id', v_team.id,
    'nickname', v_participant.nickname,
    'team_name', v_team.name,
    'organization_name', v_org.name
  );
end;
$$;

create or replace function public.get_active_challenge_for_org()
returns challenges
language sql
security definer
set search_path = public
as $$
  with p as (
    select organization_id from participant_profiles where user_id = auth.uid() limit 1
  )
  select c.*
  from challenges c
  join p on p.organization_id = c.organization_id
  where c.status = 'active'
  order by c.start_date asc
  limit 1
$$;

create or replace function public.get_active_challenge_by_code(p_organization_code text)
returns challenges
language sql
security definer
set search_path = public
as $$
  select c.*
  from challenges c
  join organizations o on o.id = c.organization_id
  where o.organization_code = p_organization_code
    and o.status = 'active'
    and c.status = 'active'
  order by c.start_date asc
  limit 1
$$;

create or replace function public.create_organization_invite(
  p_organization_code text,
  p_poc_email text,
  p_country_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations%rowtype;
  v_token text;
begin
  if not is_platform_admin() then
    raise exception 'Only platform admins can create organization invites';
  end if;

  select * into v_org
  from organizations
  where organization_code = upper(trim(p_organization_code))
    and status = 'active'
  limit 1;

  if v_org.id is null then
    raise exception 'Organization not found for the provided code';
  end if;

  v_token := encode(gen_random_bytes(18), 'hex');

  insert into organization_invites (
    token,
    organization_id,
    poc_email,
    status,
    expires_at,
    created_by_user_id
  )
  values (
    v_token,
    v_org.id,
    lower(trim(p_poc_email)),
    'pending',
    now() + interval '10 days',
    auth.uid()
  );

  update organizations
  set country_code = lower(trim(p_country_code)),
      poc_email = lower(trim(p_poc_email))
  where id = v_org.id;

  return jsonb_build_object(
    'token', v_token,
    'invite_url_path', '/setup/' || v_token
  );
end;
$$;

create or replace function public.get_invite_setup_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite organization_invites%rowtype;
  v_org organizations%rowtype;
  v_challenge challenges%rowtype;
begin
  select * into v_invite
  from organization_invites
  where token = trim(p_token)
  limit 1;

  if v_invite.id is null then
    raise exception 'Invite token is invalid';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invite has already been used';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  select * into v_org
  from organizations
  where id = v_invite.organization_id
  limit 1;

  select * into v_challenge
  from challenges
  where organization_id = v_org.id
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'token', v_invite.token,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'organization_slug', v_org.slug,
    'organization_code', v_org.organization_code,
    'country_code', v_org.country_code,
    'poc_email', v_invite.poc_email,
    'existing_challenge_id', v_challenge.id,
    'existing_challenge_name', v_challenge.name
  );
end;
$$;

drop function if exists public.complete_invite_setup(text, text, text, timestamptz, timestamptz, boolean, boolean, text);

create or replace function public.complete_invite_setup(
  p_token text,
  p_organization_name text,
  p_country_code text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_enabled_squat boolean,
  p_enabled_burpee boolean,
  p_display_message text default null,
  p_enabled_high_knees boolean default true,
  p_enabled_lunges boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite organization_invites%rowtype;
  v_org organizations%rowtype;
  v_challenge challenges%rowtype;
begin
  select * into v_invite
  from organization_invites
  where token = trim(p_token)
  limit 1;

  if v_invite.id is null then
    raise exception 'Invite token is invalid';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invite has already been used';
  end if;

  if v_invite.expires_at < now() then
    update organization_invites set status = 'expired' where id = v_invite.id;
    raise exception 'Invite has expired';
  end if;

  select * into v_org
  from organizations
  where id = v_invite.organization_id
  limit 1;

  update organizations
  set name = trim(p_organization_name),
      country_code = lower(trim(p_country_code)),
      slug = lower(regexp_replace(trim(p_organization_name), '[^a-zA-Z0-9]+', '-', 'g')),
      poc_email = v_invite.poc_email
  where id = v_org.id
  returning * into v_org;

  select * into v_challenge
  from challenges
  where organization_id = v_org.id and status in ('active', 'upcoming')
  order by start_date asc
  limit 1;

  if v_challenge.id is null then
    insert into challenges (
      organization_id,
      name,
      description,
      start_date,
      end_date,
      timezone,
      status,
      enabled_squat,
      enabled_burpee,
      enabled_high_knees,
      enabled_lunges
    )
    values (
      v_org.id,
      trim(p_organization_name) || ' Challenge',
      coalesce(nullif(trim(p_display_message), ''), ''),
      p_start_date,
      p_end_date,
      'UTC',
      (case when p_start_date <= now() and p_end_date >= now() then 'active' else 'upcoming' end)::challenge_status,
      p_enabled_squat,
      p_enabled_burpee,
      p_enabled_high_knees,
      p_enabled_lunges
    )
    returning * into v_challenge;
  else
    update challenges
    set name = trim(p_organization_name) || ' Challenge',
        description = coalesce(nullif(trim(p_display_message), ''), description),
        start_date = p_start_date,
        end_date = p_end_date,
        enabled_squat = p_enabled_squat,
        enabled_burpee = p_enabled_burpee,
        enabled_high_knees = p_enabled_high_knees,
        enabled_lunges = p_enabled_lunges,
        status = (case when p_start_date <= now() and p_end_date >= now() then 'active' else 'upcoming' end)::challenge_status
    where id = v_challenge.id
    returning * into v_challenge;
  end if;

  update organization_invites
  set status = 'accepted',
      accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'launch_url_path', '/launch/' || v_org.country_code || '/' || v_org.slug
  );
end;
$$;

create or replace function public.get_public_launch_context(
  p_country_code text,
  p_organization_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations%rowtype;
  v_challenge challenges%rowtype;
  v_pending_invite organization_invites%rowtype;
begin
  select * into v_org
  from organizations
  where country_code = lower(trim(p_country_code))
    and slug = lower(trim(p_organization_slug))
    and status = 'active'
  limit 1;

  if v_org.id is null then
    raise exception 'Organization launch page not found';
  end if;

  select * into v_challenge
  from challenges
  where organization_id = v_org.id and status in ('active', 'upcoming')
  order by start_date asc
  limit 1;

  select * into v_pending_invite
  from organization_invites
  where organization_id = v_org.id
    and status = 'pending'
    and expires_at >= now()
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'organization_slug', v_org.slug,
    'country_code', v_org.country_code,
    'organization_code', v_org.organization_code,
    'display_message', v_challenge.description,
    'setup_status', case when v_pending_invite.id is null then 'ready' else 'pending' end,
    'setup_url_path', case when v_pending_invite.id is null then null else '/setup/' || v_pending_invite.token end
  );
end;
$$;

create or replace function public.calculate_streak_bonus(
  p_challenge_id uuid,
  p_target_type streak_target_type,
  p_streak_day int
)
returns table(rule_id uuid, bonus_points int)
language sql
stable
as $$
  with rules as (
    select r.*
    from streak_bonus_rules r
    where r.challenge_id = p_challenge_id
      and r.target_type = p_target_type
  )
  select r.id, r.bonus_points
  from rules r
  where
    (r.rule_type = 'milestone' and r.streak_day = p_streak_day)
    or
    (r.rule_type = 'fixed_daily_after_min' and p_streak_day >= r.streak_day)
  order by r.bonus_points desc
  limit 1
$$;

create or replace function public.submit_workout_secure(
  p_session_id uuid,
  p_exercise text,
  p_reps int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile participant_profiles%rowtype;
  v_participant participants%rowtype;
  v_challenge challenges%rowtype;
  v_today date;
  v_now_org timestamptz;
  v_existing workouts%rowtype;
  v_points int;
  v_is_qualifying boolean := false;
  v_daily_sessions int := 0;
  v_workout workouts%rowtype;
  v_streak participant_streaks%rowtype;
  v_next_streak int;
  v_rule record;
  v_team_size int;
  v_team_qualified_today boolean := false;
  v_team_streak team_streaks%rowtype;
  v_team_next_streak int;
  v_team_rule record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_exercise not in ('squat', 'burpee', 'high-knees', 'lunges') then
    raise exception 'Invalid exercise';
  end if;

  if p_reps < 0 then
    raise exception 'Invalid rep count';
  end if;

  select * into v_profile from participant_profiles where user_id = auth.uid() limit 1;
  if v_profile.participant_id is null then
    raise exception 'Participant profile not found';
  end if;

  select * into v_participant
  from participants
  where id = v_profile.participant_id and organization_id = v_profile.organization_id
  limit 1;

  if v_participant.id is null then
    raise exception 'Participant not found';
  end if;

  select * into v_challenge
  from challenges
  where organization_id = v_participant.organization_id
    and status = 'active'
  order by start_date asc
  limit 1;

  if v_challenge.id is null then
    raise exception 'No active challenge';
  end if;

  if p_exercise = 'squat' and not v_challenge.enabled_squat then
    raise exception 'Squat exercise disabled';
  end if;

  if p_exercise = 'burpee' and not v_challenge.enabled_burpee then
    raise exception 'Burpee exercise disabled';
  end if;

  if p_exercise = 'high-knees' and not v_challenge.enabled_high_knees then
    raise exception 'High knees exercise disabled';
  end if;

  if p_exercise = 'lunges' and not v_challenge.enabled_lunges then
    raise exception 'Lunges exercise disabled';
  end if;

  v_now_org := now() at time zone v_challenge.timezone;
  if v_now_org < (v_challenge.start_date at time zone v_challenge.timezone)
    or v_now_org > (v_challenge.end_date at time zone v_challenge.timezone) then
    raise exception 'Challenge window is closed';
  end if;

  v_today := (v_now_org)::date;

  select * into v_existing
  from workouts
  where organization_id = v_participant.organization_id
    and challenge_id = v_challenge.id
    and participant_id = v_participant.id
    and session_id = p_session_id
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'workout_id', v_existing.id,
      'idempotent', true,
      'points_added', 0
    );
  end if;

  select count(*)::int into v_daily_sessions
  from workouts w
  where w.organization_id = v_participant.organization_id
    and w.challenge_id = v_challenge.id
    and w.participant_id = v_participant.id
    and (w.created_at at time zone v_challenge.timezone)::date = v_today;

  if v_daily_sessions >= v_challenge.max_sessions_per_day then
    raise exception 'Maximum daily sessions reached';
  end if;

  v_points := p_reps * case
    when p_exercise = 'squat' then v_challenge.squat_points_per_rep
    when p_exercise = 'burpee' then v_challenge.burpee_points_per_rep
    when p_exercise = 'high-knees' then v_challenge.high_knees_points_per_rep
    else v_challenge.lunges_points_per_rep
  end;

  if (v_challenge.qualifying_threshold_type = 'squats' and p_exercise = 'squat' and p_reps >= v_challenge.qualifying_threshold_value)
    or (v_challenge.qualifying_threshold_type = 'burpees' and p_exercise = 'burpee' and p_reps >= v_challenge.qualifying_threshold_value)
    or (v_challenge.qualifying_threshold_type = 'high_knees' and p_exercise = 'high-knees' and p_reps >= v_challenge.qualifying_threshold_value)
    or (v_challenge.qualifying_threshold_type = 'lunges' and p_exercise = 'lunges' and p_reps >= v_challenge.qualifying_threshold_value)
    or (v_challenge.qualifying_threshold_type = 'total_points' and v_points >= v_challenge.qualifying_threshold_value) then
    v_is_qualifying := true;
  end if;

  insert into workouts (
    organization_id,
    challenge_id,
    participant_id,
    team_id,
    session_id,
    exercise,
    reps,
    qualifying
  )
  values (
    v_participant.organization_id,
    v_challenge.id,
    v_participant.id,
    v_participant.team_id,
    p_session_id,
    p_exercise,
    p_reps,
    v_is_qualifying
  )
  returning * into v_workout;

  insert into point_transactions (
    organization_id,
    challenge_id,
    participant_id,
    team_id,
    transaction_type,
    source_id,
    points,
    description
  )
  values (
    v_participant.organization_id,
    v_challenge.id,
    v_participant.id,
    v_participant.team_id,
    'workout',
    v_workout.id,
    v_points,
    format('%s workout (%s reps)', p_exercise, p_reps)
  );

  insert into participant_streaks (organization_id, challenge_id, participant_id)
  values (v_participant.organization_id, v_challenge.id, v_participant.id)
  on conflict (challenge_id, participant_id) do nothing;

  select * into v_streak
  from participant_streaks
  where challenge_id = v_challenge.id and participant_id = v_participant.id
  for update;

  if v_is_qualifying then
    if v_streak.last_qualified_date is distinct from v_today then
      if v_streak.last_qualified_date = v_today - interval '1 day' then
        v_next_streak := v_streak.current_streak + 1;
      else
        v_next_streak := 1;
      end if;

      update participant_streaks
      set current_streak = v_next_streak,
          longest_streak = greatest(v_streak.longest_streak, v_next_streak),
          last_qualified_date = v_today,
          updated_at = now()
      where id = v_streak.id;

      select * into v_rule from calculate_streak_bonus(v_challenge.id, 'participant', v_next_streak);
      if v_rule.rule_id is not null then
        insert into streak_bonus_awards (
          organization_id,
          challenge_id,
          participant_id,
          rule_id,
          streak_day
        )
        values (
          v_participant.organization_id,
          v_challenge.id,
          v_participant.id,
          v_rule.rule_id,
          v_next_streak
        )
        on conflict do nothing;

        if found then
          insert into point_transactions (
            organization_id,
            challenge_id,
            participant_id,
            team_id,
            transaction_type,
            source_id,
            points,
            description
          )
          values (
            v_participant.organization_id,
            v_challenge.id,
            v_participant.id,
            v_participant.team_id,
            'participant_streak_bonus',
            v_rule.rule_id,
            v_rule.bonus_points,
            format('Participant streak bonus day %s', v_next_streak)
          );

          update participant_streaks
          set total_streak_bonus = total_streak_bonus + v_rule.bonus_points
          where id = v_streak.id;
        end if;
      end if;
    end if;
  end if;

  insert into team_streaks (organization_id, challenge_id, team_id)
  values (v_participant.organization_id, v_challenge.id, v_participant.team_id)
  on conflict (challenge_id, team_id) do nothing;

  select count(*)::int into v_team_size
  from participants p
  where p.organization_id = v_participant.organization_id and p.team_id = v_participant.team_id;

  if v_challenge.team_qualification_type = 'fixed_count' then
    select (count(distinct w.participant_id) >= v_challenge.team_required_unique_members) into v_team_qualified_today
    from workouts w
    where w.organization_id = v_participant.organization_id
      and w.challenge_id = v_challenge.id
      and w.team_id = v_participant.team_id
      and w.qualifying = true
      and (w.created_at at time zone v_challenge.timezone)::date = v_today;
  else
    select (
      case when v_team_size = 0 then false
      else ((count(distinct w.participant_id)::numeric / v_team_size::numeric) * 100.0) >= v_challenge.team_required_participation_percent
      end
    ) into v_team_qualified_today
    from workouts w
    where w.organization_id = v_participant.organization_id
      and w.challenge_id = v_challenge.id
      and w.team_id = v_participant.team_id
      and w.qualifying = true
      and (w.created_at at time zone v_challenge.timezone)::date = v_today;
  end if;

  if v_team_qualified_today then
    select * into v_team_streak
    from team_streaks
    where challenge_id = v_challenge.id and team_id = v_participant.team_id
    for update;

    if v_team_streak.last_qualified_date is distinct from v_today then
      if v_team_streak.last_qualified_date = v_today - interval '1 day' then
        v_team_next_streak := v_team_streak.current_streak + 1;
      else
        v_team_next_streak := 1;
      end if;

      update team_streaks
      set current_streak = v_team_next_streak,
          longest_streak = greatest(v_team_streak.longest_streak, v_team_next_streak),
          last_qualified_date = v_today,
          updated_at = now()
      where id = v_team_streak.id;

      select * into v_team_rule from calculate_streak_bonus(v_challenge.id, 'team', v_team_next_streak);
      if v_team_rule.rule_id is not null then
        insert into streak_bonus_awards (
          organization_id,
          challenge_id,
          team_id,
          rule_id,
          streak_day
        )
        values (
          v_participant.organization_id,
          v_challenge.id,
          v_participant.team_id,
          v_team_rule.rule_id,
          v_team_next_streak
        )
        on conflict do nothing;

        if found then
          insert into point_transactions (
            organization_id,
            challenge_id,
            team_id,
            transaction_type,
            source_id,
            points,
            description
          )
          values (
            v_participant.organization_id,
            v_challenge.id,
            v_participant.team_id,
            'team_streak_bonus',
            v_team_rule.rule_id,
            v_team_rule.bonus_points,
            format('Team streak bonus day %s', v_team_next_streak)
          );

          update team_streaks
          set total_streak_bonus = total_streak_bonus + v_team_rule.bonus_points
          where id = v_team_streak.id;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'workout_id', v_workout.id,
    'idempotent', false,
    'points_added', v_points,
    'qualifying', v_is_qualifying
  );
end;
$$;

create or replace function public.get_individual_leaderboard(
  p_challenge_id uuid,
  p_period text default 'overall'
)
returns table (
  participant_id uuid,
  participant_name text,
  team_name text,
  total_squats int,
  total_burpees int,
  total_high_knees int,
  total_lunges int,
  score int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge challenges%rowtype;
  v_org_today date;
begin
  select * into v_challenge from challenges where id = p_challenge_id;
  if v_challenge.id is null then
    raise exception 'Challenge not found';
  end if;

  if not (is_platform_admin() or is_org_admin(v_challenge.organization_id) or current_organization_id() = v_challenge.organization_id) then
    raise exception 'Unauthorized';
  end if;

  v_org_today := (now() at time zone v_challenge.timezone)::date;

  return query
  with workout_agg as (
    select
      w.participant_id,
      coalesce(sum(case when w.exercise = 'squat' then w.reps else 0 end), 0)::int as total_squats,
      coalesce(sum(case when w.exercise = 'burpee' then w.reps else 0 end), 0)::int as total_burpees,
      coalesce(sum(case when w.exercise = 'high-knees' then w.reps else 0 end), 0)::int as total_high_knees,
      coalesce(sum(case when w.exercise = 'lunges' then w.reps else 0 end), 0)::int as total_lunges
    from workouts w
    where w.challenge_id = p_challenge_id
      and (p_period <> 'today' or (w.created_at at time zone v_challenge.timezone)::date = v_org_today)
    group by w.participant_id
  ),
  tx as (
    select pt.*
    from point_transactions pt
    where pt.challenge_id = p_challenge_id
      and (p_period <> 'today' or (pt.created_at at time zone v_challenge.timezone)::date = v_org_today)
  ),
  agg as (
    select
      p.id as participant_id,
      case
        when os.leaderboard_privacy_mode = 'nickname' then coalesce(p.display_alias, p.nickname)
        when os.leaderboard_privacy_mode = 'initials' then upper(left(p.nickname, 1)) || '***'
        else 'Participant #' || right(replace(p.id::text, '-', ''), 6)
      end as participant_name,
      t.name as team_name,
      coalesce(wa.total_squats, 0)::int as total_squats,
      coalesce(wa.total_burpees, 0)::int as total_burpees,
      coalesce(wa.total_high_knees, 0)::int as total_high_knees,
      coalesce(wa.total_lunges, 0)::int as total_lunges,
      coalesce(sum(tx.points), 0)::int as score
    from participants p
    join teams t on t.id = p.team_id
    join organization_settings os on os.organization_id = p.organization_id
    left join workout_agg wa on wa.participant_id = p.id
    left join tx on tx.participant_id = p.id
    where p.organization_id = v_challenge.organization_id
    group by p.id, p.nickname, p.display_alias, t.name, os.leaderboard_privacy_mode, wa.total_squats, wa.total_burpees, wa.total_high_knees, wa.total_lunges
  )
  select
    agg.participant_id,
    agg.participant_name,
    agg.team_name,
    agg.total_squats,
    agg.total_burpees,
    agg.total_high_knees,
    agg.total_lunges,
    agg.score
  from agg
  order by agg.score desc, agg.participant_name asc;
end;
$$;

create or replace function public.get_team_leaderboard(
  p_challenge_id uuid,
  p_period text default 'overall'
)
returns table (
  rank bigint,
  team_id uuid,
  team_name text,
  workout_points int,
  team_streak_bonus int,
  total_team_points int,
  unique_participants int,
  current_streak int,
  participation_percentage numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge challenges%rowtype;
  v_org_today date;
begin
  select * into v_challenge from challenges where id = p_challenge_id;
  if v_challenge.id is null then
    raise exception 'Challenge not found';
  end if;

  if not (is_platform_admin() or is_org_admin(v_challenge.organization_id) or current_organization_id() = v_challenge.organization_id) then
    raise exception 'Unauthorized';
  end if;

  v_org_today := (now() at time zone v_challenge.timezone)::date;

  return query
  with tx as (
    select pt.*
    from point_transactions pt
    where pt.challenge_id = p_challenge_id
      and pt.team_id is not null
      and (p_period <> 'today' or (pt.created_at at time zone v_challenge.timezone)::date = v_org_today)
  ),
  participant_counts as (
    select p.team_id, count(*)::int as team_size
    from participants p
    where p.organization_id = v_challenge.organization_id
    group by p.team_id
  ),
  daily_participants as (
    select w.team_id, count(distinct w.participant_id)::int as unique_today
    from workouts w
    where w.challenge_id = p_challenge_id
      and (w.created_at at time zone v_challenge.timezone)::date = v_org_today
    group by w.team_id
  ),
  agg as (
    select
      t.id as team_id,
      t.name as team_name,
      coalesce(sum(case when tx.transaction_type = 'workout' then tx.points else 0 end), 0)::int as workout_points,
      coalesce(sum(case when tx.transaction_type = 'team_streak_bonus' then tx.points else 0 end), 0)::int as team_streak_bonus,
      coalesce(sum(tx.points), 0)::int as total_team_points,
      coalesce(dp.unique_today, 0)::int as unique_participants,
      coalesce(ts.current_streak, 0) as current_streak,
      case
        when coalesce(pc.team_size, 0) = 0 then 0::numeric
        else round((coalesce(dp.unique_today, 0)::numeric / pc.team_size::numeric) * 100.0, 2)
      end as participation_percentage
    from teams t
    left join tx on tx.team_id = t.id
    left join team_streaks ts on ts.team_id = t.id and ts.challenge_id = p_challenge_id
    left join participant_counts pc on pc.team_id = t.id
    left join daily_participants dp on dp.team_id = t.id
    where t.organization_id = v_challenge.organization_id
    group by t.id, t.name, ts.current_streak, dp.unique_today, pc.team_size
  )
  select
    dense_rank() over (order by agg.total_team_points desc, agg.team_name asc) as rank,
    agg.team_id,
    agg.team_name,
    agg.workout_points,
    agg.team_streak_bonus,
    agg.total_team_points,
    agg.unique_participants,
    agg.current_streak,
    agg.participation_percentage
  from agg
  order by rank;
end;
$$;

create or replace function public.write_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous_value jsonb,
  p_new_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value
  )
  values (
    p_organization_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_previous_value,
    p_new_value
  );
end;
$$;

create or replace function public.create_guest_challenge(
  p_creator_key text,
  p_creator_name text,
  p_title text,
  p_duration_days int,
  p_attempts_per_day int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_hash text;
  v_existing guest_challenges%rowtype;
  v_challenge guest_challenges%rowtype;
  v_code text;
  v_duration_days int;
  v_attempts_per_day int;
begin
  if nullif(trim(p_creator_key), '') is null then
    raise exception 'Creator key is required';
  end if;

  if nullif(trim(p_creator_name), '') is null then
    raise exception 'Guest name is required';
  end if;

  v_duration_days := least(7, greatest(1, coalesce(p_duration_days, 1)));
  v_attempts_per_day := least(5, greatest(1, coalesce(p_attempts_per_day, 3)));
  v_creator_hash := encode(digest(trim(p_creator_key), 'sha256'), 'hex');

  perform purge_expired_guest_challenges();

  select * into v_existing
  from guest_challenges
  where creator_key_hash = v_creator_hash
    and deleted_at is null
    and end_date >= now()
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    raise exception 'You already have an active guest challenge. Share that one until it ends.';
  end if;

  loop
    v_code := lower(regexp_replace(trim(coalesce(nullif(p_title, ''), 'challenge')), '[^a-zA-Z0-9]+', '-', 'g'));
    v_code := trim(both '-' from v_code);
    v_code := coalesce(nullif(v_code, ''), 'challenge') || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);

    begin
      insert into guest_challenges (
        code,
        title,
        creator_name,
        creator_key_hash,
        duration_days,
        attempts_per_day,
        max_players,
        start_date,
        end_date,
        purge_after
      )
      values (
        v_code,
        trim(coalesce(nullif(p_title, ''), 'FitPerks Challenge')),
        trim(p_creator_name),
        v_creator_hash,
        v_duration_days,
        v_attempts_per_day,
        10,
        now(),
        now() + make_interval(days => v_duration_days),
        now() + make_interval(days => v_duration_days + 3)
      )
      returning * into v_challenge;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object(
    'id', v_challenge.id,
    'code', v_challenge.code,
    'title', v_challenge.title,
    'creator_name', v_challenge.creator_name,
    'duration_days', v_challenge.duration_days,
    'attempts_per_day', v_challenge.attempts_per_day,
    'max_players', v_challenge.max_players,
    'start_date', v_challenge.start_date,
    'end_date', v_challenge.end_date,
    'purge_after', v_challenge.purge_after,
    'created_at', v_challenge.created_at
  );
end;
$$;

create or replace function public.get_guest_challenge(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge guest_challenges%rowtype;
begin
  perform purge_expired_guest_challenges();

  select * into v_challenge
  from guest_challenges
  where code = lower(trim(p_code))
    and deleted_at is null
  limit 1;

  if v_challenge.id is null then
    raise exception 'Guest challenge not found';
  end if;

  return jsonb_build_object(
    'id', v_challenge.id,
    'code', v_challenge.code,
    'title', v_challenge.title,
    'creator_name', v_challenge.creator_name,
    'duration_days', v_challenge.duration_days,
    'attempts_per_day', v_challenge.attempts_per_day,
    'max_players', v_challenge.max_players,
    'start_date', v_challenge.start_date,
    'end_date', v_challenge.end_date,
    'purge_after', v_challenge.purge_after,
    'created_at', v_challenge.created_at
  );
end;
$$;

create or replace function public.submit_guest_attempt(
  p_code text,
  p_guest_name text,
  p_session_id uuid,
  p_exercise text,
  p_reps int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge guest_challenges%rowtype;
  v_player guest_challenge_players%rowtype;
  v_player_count int;
  v_attempts_today int;
  v_score int;
  v_attempt guest_challenge_attempts%rowtype;
begin
  perform purge_expired_guest_challenges();

  if p_exercise not in ('squat', 'burpee', 'high-knees', 'lunges') then
    raise exception 'Invalid exercise';
  end if;

  if p_reps < 0 then
    raise exception 'Invalid rep count';
  end if;

  select * into v_challenge
  from guest_challenges
  where code = lower(trim(p_code))
    and deleted_at is null
  limit 1;

  if v_challenge.id is null then
    raise exception 'Guest challenge not found';
  end if;

  if now() > v_challenge.end_date then
    raise exception 'Guest challenge has ended';
  end if;

  if nullif(trim(p_guest_name), '') is null then
    raise exception 'Guest name is required';
  end if;

  select * into v_player
  from guest_challenge_players
  where challenge_id = v_challenge.id
    and lower(guest_name) = lower(trim(p_guest_name))
  limit 1;

  if v_player.id is null then
    select count(*) into v_player_count
    from guest_challenge_players
    where challenge_id = v_challenge.id;

    if v_player_count >= v_challenge.max_players then
      raise exception 'This guest challenge is full';
    end if;

    insert into guest_challenge_players (challenge_id, guest_name)
    values (v_challenge.id, trim(p_guest_name))
    returning * into v_player;
  end if;

  select count(*) into v_attempts_today
  from guest_challenge_attempts
  where challenge_id = v_challenge.id
    and player_id = v_player.id
    and created_at::date = now()::date;

  if v_attempts_today >= v_challenge.attempts_per_day then
    raise exception 'Daily attempt limit reached';
  end if;

  v_score := p_reps * case
    when p_exercise = 'burpee' then 2
    when p_exercise = 'lunges' then 2
    else 1
  end;

  insert into guest_challenge_attempts (
    challenge_id,
    player_id,
    session_id,
    exercise,
    reps,
    score
  )
  values (
    v_challenge.id,
    v_player.id,
    p_session_id,
    p_exercise,
    p_reps,
    v_score
  )
  on conflict (challenge_id, player_id, session_id) do update
  set reps = excluded.reps,
      score = excluded.score
  returning * into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'player_id', v_player.id,
    'score', v_attempt.score
  );
end;
$$;

create or replace function public.get_guest_scoreboard(p_code text)
returns table(
  rank bigint,
  guest_name text,
  daily_best_score int,
  overall_score int,
  attempts_today int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge guest_challenges%rowtype;
begin
  perform purge_expired_guest_challenges();

  select * into v_challenge
  from guest_challenges
  where code = lower(trim(p_code))
    and deleted_at is null
  limit 1;

  if v_challenge.id is null then
    raise exception 'Guest challenge not found';
  end if;

  return query
  with today_attempts as (
    select
      p.id as player_id,
      p.guest_name as player_name,
      a.score,
      row_number() over (partition by p.id order by a.score desc, a.created_at asc) as score_rank
    from guest_challenge_players p
    join guest_challenge_attempts a on a.player_id = p.id
    where p.challenge_id = v_challenge.id
      and a.created_at::date = now()::date
  ),
  daily as (
    select
      player_id,
      player_name,
      coalesce(sum(score) filter (where score_rank <= 3), 0)::int as daily_best_score,
      count(*)::int as attempts_today
    from today_attempts
    group by player_id, player_name
  ),
  overall as (
    select
      p.id as player_id,
      p.guest_name as player_name,
      coalesce(sum(a.score), 0)::int as overall_score
    from guest_challenge_players p
    left join guest_challenge_attempts a on a.player_id = p.id
    where p.challenge_id = v_challenge.id
    group by p.id, p.guest_name
  )
  select
    dense_rank() over (order by o.overall_score desc, o.player_name asc) as rank,
    o.player_name as guest_name,
    coalesce(d.daily_best_score, 0)::int as daily_best_score,
    o.overall_score,
    coalesce(d.attempts_today, 0)::int as attempts_today
  from overall o
  left join daily d on d.player_id = o.player_id
  order by rank;
end;
$$;

create or replace function public.purge_expired_guest_challenges()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from guest_challenges
  where purge_after < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter table organizations enable row level security;
alter table organization_settings enable row level security;
alter table admin_users enable row level security;
alter table organization_invites enable row level security;
alter table teams enable row level security;
alter table participants enable row level security;
alter table participant_profiles enable row level security;
alter table challenges enable row level security;
alter table challenge_participants enable row level security;
alter table workouts enable row level security;
alter table participant_streaks enable row level security;
alter table team_streaks enable row level security;
alter table streak_bonus_rules enable row level security;
alter table streak_bonus_awards enable row level security;
alter table point_transactions enable row level security;
alter table guest_challenges enable row level security;
alter table guest_challenge_players enable row level security;
alter table guest_challenge_attempts enable row level security;
alter table audit_logs enable row level security;

drop policy if exists "Organizations tenant read" on organizations;
create policy "Organizations tenant read" on organizations
for select
using (
  is_platform_admin()
  or id = current_organization_id()
  or is_org_admin(id)
);

drop policy if exists "Organizations platform write" on organizations;
create policy "Organizations platform write" on organizations
for all
using (is_platform_admin())
with check (is_platform_admin());

drop policy if exists "Org settings tenant read" on organization_settings;
create policy "Org settings tenant read" on organization_settings
for select
using (is_platform_admin() or organization_id = current_organization_id() or is_org_admin(organization_id));

drop policy if exists "Org settings org admin write" on organization_settings;
create policy "Org settings org admin write" on organization_settings
for all
using (is_platform_admin() or is_org_admin(organization_id))
with check (is_platform_admin() or is_org_admin(organization_id));

drop policy if exists "Admin users restricted read" on admin_users;
create policy "Admin users restricted read" on admin_users
for select
using (
  is_platform_admin()
  or (role = 'organization_admin' and organization_id = current_organization_id())
  or user_id = auth.uid()
);

drop policy if exists "Admin users platform write" on admin_users;
create policy "Admin users platform write" on admin_users
for all
using (is_platform_admin())
with check (is_platform_admin());

drop policy if exists "Organization invites admin read" on organization_invites;
create policy "Organization invites admin read" on organization_invites
for select
using (is_platform_admin() or is_org_admin(organization_id));

drop policy if exists "Organization invites platform write" on organization_invites;
create policy "Organization invites platform write" on organization_invites
for all
using (is_platform_admin())
with check (is_platform_admin());

drop policy if exists "Teams tenant read" on teams;
create policy "Teams tenant read" on teams
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Teams org admin write" on teams;
create policy "Teams org admin write" on teams
for all
using (is_platform_admin() or is_org_admin(organization_id))
with check (is_platform_admin() or is_org_admin(organization_id));

drop policy if exists "Participants tenant read" on participants;
create policy "Participants tenant read" on participants
for select
using (
  organization_id = current_organization_id()
  or is_org_admin(organization_id)
  or is_platform_admin()
);

drop policy if exists "Participants self write" on participants;
create policy "Participants self write" on participants
for update
using (id = current_participant_id() and organization_id = current_organization_id())
with check (id = current_participant_id() and organization_id = current_organization_id());

drop policy if exists "Participant profiles self" on participant_profiles;
create policy "Participant profiles self" on participant_profiles
for select
using (
  user_id = auth.uid()
  or is_org_admin(organization_id)
  or is_platform_admin()
);

drop policy if exists "Participant profiles definer only write" on participant_profiles;
create policy "Participant profiles definer only write" on participant_profiles
for all
using (false)
with check (false);

drop policy if exists "Challenges tenant read" on challenges;
create policy "Challenges tenant read" on challenges
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Challenges org admin write" on challenges;
create policy "Challenges org admin write" on challenges
for all
using (is_platform_admin() or is_org_admin(organization_id))
with check (is_platform_admin() or is_org_admin(organization_id));

drop policy if exists "Challenge participants tenant read" on challenge_participants;
create policy "Challenge participants tenant read" on challenge_participants
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Challenge participants org admin write" on challenge_participants;
create policy "Challenge participants org admin write" on challenge_participants
for all
using (is_platform_admin() or is_org_admin(organization_id))
with check (is_platform_admin() or is_org_admin(organization_id));

drop policy if exists "Workouts tenant read" on workouts;
create policy "Workouts tenant read" on workouts
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Workouts no direct write" on workouts;
create policy "Workouts no direct write" on workouts
for all
using (false)
with check (false);

drop policy if exists "Participant streaks tenant read" on participant_streaks;
create policy "Participant streaks tenant read" on participant_streaks
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Team streaks tenant read" on team_streaks;
create policy "Team streaks tenant read" on team_streaks
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Streak rules tenant read" on streak_bonus_rules;
create policy "Streak rules tenant read" on streak_bonus_rules
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Streak rules org admin write" on streak_bonus_rules;
create policy "Streak rules org admin write" on streak_bonus_rules
for all
using (is_platform_admin() or is_org_admin(organization_id))
with check (is_platform_admin() or is_org_admin(organization_id));

drop policy if exists "Streak awards tenant read" on streak_bonus_awards;
create policy "Streak awards tenant read" on streak_bonus_awards
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Point tx tenant read" on point_transactions;
create policy "Point tx tenant read" on point_transactions
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Point tx admin adjustment write" on point_transactions;
create policy "Point tx admin adjustment write" on point_transactions
for insert
with check (
  transaction_type = 'admin_adjustment'
  and (is_platform_admin() or is_org_admin(organization_id))
);

drop policy if exists "Audit logs tenant read" on audit_logs;
create policy "Audit logs tenant read" on audit_logs
for select
using (organization_id = current_organization_id() or is_org_admin(organization_id) or is_platform_admin());

drop policy if exists "Audit logs internal write" on audit_logs;
create policy "Audit logs internal write" on audit_logs
for insert
with check (auth.uid() is not null);
