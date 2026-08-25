create or replace function public.submit_guest_attempt(
  p_code text,
  p_guest_name text,
  p_guest_email text,
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

  if p_exercise not in ('squat', 'burpee', 'high-knees', 'lunges', 'plank') then
    raise exception 'Invalid exercise';
  end if;

  if p_reps < 0 then
    raise exception 'Invalid rep count';
  end if;

  select * into v_challenge
  from guest_challenges
  where lower(code) = lower(trim(p_code))
    and deleted_at is null
  limit 1;

  if v_challenge.id is null then
    raise exception 'Guest challenge not found';
  end if;

  if now() > v_challenge.end_date then
    raise exception 'Guest challenge has ended';
  end if;

  if current_date < v_challenge.start_date::date then
    raise exception 'Guest challenge has not started yet';
  end if;

  if nullif(trim(p_guest_name), '') is null then
    raise exception 'Guest name is required';
  end if;

  if nullif(trim(p_guest_email), '') is null or position('@' in trim(p_guest_email)) < 2 then
    raise exception 'Valid guest email is required';
  end if;

  select * into v_player
  from guest_challenge_players
  where challenge_id = v_challenge.id
    and lower(guest_email) = lower(trim(p_guest_email))
  limit 1;

  if v_player.id is null then
    select count(*) into v_player_count
    from guest_challenge_players
    where challenge_id = v_challenge.id;

    if v_player_count >= v_challenge.max_players then
      raise exception 'This guest challenge is full';
    end if;

    if (
      select count(*)
      from guest_challenge_players p
      join guest_challenges c on c.id = p.challenge_id
      where lower(p.guest_email) = lower(trim(p_guest_email))
        and c.deleted_at is null
        and c.end_date >= now()
    ) >= 3 then
      raise exception 'This email is already active in 3 challenges. Wait for one to finish.';
    end if;

    insert into guest_challenge_players (challenge_id, guest_name, guest_email)
    values (v_challenge.id, trim(p_guest_name), lower(trim(p_guest_email)))
    returning * into v_player;
  end if;

  if not (p_exercise = any(v_challenge.selected_exercises)) then
    raise exception 'This workout is not part of the challenge';
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
