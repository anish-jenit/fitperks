alter table solo_player_attempts drop constraint if exists solo_player_attempts_exercise_check;
alter table solo_player_attempts add constraint solo_player_attempts_exercise_check check (exercise in ('squat', 'burpee', 'high-knees', 'lunges', 'plank', 'push-ups'));

create table if not exists solo_monthly_winners (
  month_start date primary key,
  player_email text not null,
  player_name text not null,
  score int not null check (score >= 0),
  reps int not null check (reps >= 0),
  exercise text not null check (exercise in ('squat', 'burpee', 'high-knees', 'lunges', 'plank', 'push-ups')),
  winning_attempt_id uuid references solo_player_attempts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'notified', 'awarded', 'void')),
  voucher_code text,
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_start = date_trunc('month', month_start)::date)
);

alter table solo_player_attempts add column if not exists is_flagged boolean not null default false;
alter table solo_player_attempts add column if not exists flag_reasons text[] not null default '{}';
alter table solo_player_attempts add column if not exists reviewed_at timestamptz;
alter table solo_player_attempts add column if not exists reviewed_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_solo_player_attempts_period_score on solo_player_attempts(created_at desc, score desc, reps desc);
create index if not exists idx_solo_player_attempts_flagged_created on solo_player_attempts(is_flagged, created_at desc);
create index if not exists idx_solo_monthly_winners_status on solo_monthly_winners(status, month_start desc);

drop function if exists public.submit_solo_attempt(text, text, uuid, text, int);

create or replace function public.submit_solo_attempt(
  p_player_name text,
  p_player_email text,
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
  v_score int;
  v_attempt solo_player_attempts%rowtype;
  v_level int;
  v_last_level_up_streak int;
  v_last_workout_date date;
  v_current_streak int := 0;
  v_rep_cap int;
  v_recent_attempts int := 0;
  v_flag_reasons text[] := '{}';
begin
  if p_exercise not in ('squat', 'burpee', 'high-knees', 'lunges', 'plank', 'push-ups') then
    raise exception 'Invalid exercise';
  end if;

  if p_reps < 0 then
    raise exception 'Invalid rep count';
  end if;

  if nullif(trim(p_player_email), '') is null or position('@' in trim(p_player_email)) < 2 then
    raise exception 'Valid player email is required';
  end if;

  v_score := p_reps * case
    when p_exercise = 'burpee' then 2
    when p_exercise = 'lunges' then 2
    else 1
  end;

  v_rep_cap := case
    when p_exercise = 'high-knees' then 220
    when p_exercise = 'burpee' then 140
    when p_exercise = 'push-ups' then 100
    when p_exercise = 'squat' then 95
    when p_exercise = 'lunges' then 90
    when p_exercise = 'plank' then 180
    else 120
  end;

  if p_reps > v_rep_cap then
    v_flag_reasons := array_append(v_flag_reasons, 'Rep count exceeds expected 60s range for ' || p_exercise);
  end if;

  if v_score > 260 then
    v_flag_reasons := array_append(v_flag_reasons, 'Score exceeds expected single-session range');
  end if;

  select count(*)::int into v_recent_attempts
  from solo_player_attempts
  where lower(player_email) = lower(trim(p_player_email))
    and created_at >= now() - interval '10 minutes'
    and session_id <> p_session_id;

  if v_recent_attempts >= 8 then
    v_flag_reasons := array_append(v_flag_reasons, 'High attempt frequency in 10 minutes');
  end if;

  insert into solo_player_profiles (player_email, player_name)
  values (lower(trim(p_player_email)), coalesce(nullif(trim(p_player_name), ''), 'Solo Player'))
  on conflict (player_email) do update
  set player_name = excluded.player_name,
      level = case
        when solo_player_profiles.last_workout_date is not null
          and current_date - solo_player_profiles.last_workout_date >= 7
          then greatest(1, solo_player_profiles.level - 1)
        else solo_player_profiles.level
      end,
      updated_at = now();

  insert into solo_player_attempts (
    player_email,
    player_name,
    session_id,
    exercise,
    reps,
    score,
    is_flagged,
    flag_reasons
  )
  values (
    lower(trim(p_player_email)),
    coalesce(nullif(trim(p_player_name), ''), 'Solo Player'),
    p_session_id,
    p_exercise,
    p_reps,
    v_score,
    cardinality(v_flag_reasons) > 0,
    v_flag_reasons
  )
  on conflict (player_email, session_id) do update
  set player_name = excluded.player_name,
      exercise = excluded.exercise,
      reps = excluded.reps,
      score = excluded.score,
      is_flagged = excluded.is_flagged,
      flag_reasons = excluded.flag_reasons,
      reviewed_at = null,
      reviewed_by_user_id = null
  returning * into v_attempt;

  while exists (
    select 1
    from solo_player_attempts
    where lower(player_email) = lower(trim(p_player_email))
      and created_at::date = current_date - v_current_streak
      and not is_flagged
  ) loop
    v_current_streak := v_current_streak + 1;
  end loop;

  select level, last_level_up_streak, last_workout_date into v_level, v_last_level_up_streak, v_last_workout_date
  from solo_player_profiles
  where player_email = lower(trim(p_player_email));

  if v_current_streak > 0
    and v_current_streak % 7 = 0
    and v_current_streak > coalesce(v_last_level_up_streak, 0) then
    v_level := v_level + 1;
    v_last_level_up_streak := v_current_streak;
  end if;

  update solo_player_profiles
  set level = v_level,
      last_level_change_date = case when level <> v_level then current_date else last_level_change_date end,
      last_level_up_streak = coalesce(v_last_level_up_streak, last_level_up_streak),
      last_workout_date = current_date,
      updated_at = now()
  where player_email = lower(trim(p_player_email));

  return jsonb_build_object('score', v_attempt.score);
end;
$$;

drop function if exists public.get_solo_progress(text);

create or replace function public.get_solo_progress(p_player_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_player_email));
  v_current_streak int := 0;
  v_longest_streak int := 0;
  v_running_streak int := 0;
  v_previous_day date := null;
  v_day date;
  v_daily jsonb;
  v_weekly jsonb;
  v_monthly jsonb;
  v_consistency jsonb;
  v_max_reps jsonb;
  v_daily_high_scores jsonb;
  v_weekly_high_scores jsonb;
  v_monthly_high_scores jsonb;
  v_today_best_score int := 0;
  v_today_max_reps int := 0;
  v_total_attempts int := 0;
  v_player_name text := '';
  v_level int := 1;
  v_last_workout_date date := null;
  v_badges jsonb := '[]'::jsonb;
begin
  if nullif(v_email, '') is null then
    v_email := '';
  end if;

  select coalesce(player_name, ''), level, last_workout_date
  into v_player_name, v_level, v_last_workout_date
  from solo_player_profiles
  where player_email = v_email;

  if v_level is null then
    select coalesce(player_name, '') into v_player_name
    from solo_player_attempts
    where lower(player_email) = v_email
      and not is_flagged
    order by created_at desc
    limit 1;
    v_level := 1;
  elsif v_last_workout_date is not null and current_date - v_last_workout_date >= 7 then
    v_level := greatest(1, v_level - 1);
    update solo_player_profiles
    set level = v_level, updated_at = now()
    where player_email = v_email;
  end if;

  select count(*)::int into v_total_attempts
  from solo_player_attempts
  where lower(player_email) = v_email
    and not is_flagged;

  with ranked as (
    select
      created_at::date as attempt_day,
      score,
      reps,
      row_number() over (partition by created_at::date order by score desc, reps desc, created_at asc) as score_rank
    from solo_player_attempts
    where lower(player_email) = v_email
      and not is_flagged
  )
  select coalesce(max(score), 0), coalesce(max(reps), 0)
  into v_today_best_score, v_today_max_reps
  from ranked
  where score_rank = 1
    and attempt_day = current_date;

  for v_day in
    select distinct created_at::date
    from solo_player_attempts
    where lower(player_email) = v_email
      and not is_flagged
    order by created_at::date
  loop
    if v_previous_day is null or v_day = v_previous_day + 1 then
      v_running_streak := v_running_streak + 1;
    else
      v_running_streak := 1;
    end if;
    v_longest_streak := greatest(v_longest_streak, v_running_streak);
    v_previous_day := v_day;
  end loop;

  while exists (
    select 1
    from solo_player_attempts
    where lower(player_email) = v_email
      and created_at::date = current_date - v_current_streak
      and not is_flagged
  ) loop
    v_current_streak := v_current_streak + 1;
  end loop;

  with days as (
    select (current_date - offset)::date as bucket_day
    from generate_series(6, 0, -1) as offset
  ), best_by_day as (
    select attempt_day, score, reps
    from (
      select created_at::date as attempt_day, score, reps,
        row_number() over (partition by created_at::date order by score desc, reps desc, created_at asc) as score_rank
      from solo_player_attempts
      where lower(player_email) = v_email
        and not is_flagged
    ) ranked
    where score_rank = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', to_char(days.bucket_day, 'Mon DD'),
    'score', coalesce(best_by_day.score, 0),
    'max_reps', coalesce(best_by_day.reps, 0),
    'active_days', case when best_by_day.attempt_day is null then 0 else 1 end
  ) order by days.bucket_day), '[]'::jsonb)
  into v_daily
  from days
  left join best_by_day on best_by_day.attempt_day = days.bucket_day;

  with weeks as (
    select (date_trunc('week', current_date)::date - (offset * interval '1 week'))::date as bucket_start
    from generate_series(3, 0, -1) as offset
  ), best_by_day as (
    select attempt_day, score, reps
    from (
      select created_at::date as attempt_day, score, reps,
        row_number() over (partition by created_at::date order by score desc, reps desc, created_at asc) as score_rank
      from solo_player_attempts
      where lower(player_email) = v_email
        and not is_flagged
    ) ranked
    where score_rank = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', 'W ' || to_char(weeks.bucket_start, 'MM/DD'),
    'score', coalesce(stats.score, 0),
    'max_reps', coalesce(stats.max_reps, 0),
    'active_days', coalesce(stats.active_days, 0)
  ) order by weeks.bucket_start), '[]'::jsonb)
  into v_weekly
  from weeks
  left join lateral (
    select max(score)::int as score, max(reps)::int as max_reps, count(*)::int as active_days
    from best_by_day
    where attempt_day >= weeks.bucket_start
      and attempt_day < weeks.bucket_start + 7
  ) stats on true;

  with months as (
    select (date_trunc('month', current_date)::date - (offset * interval '1 month'))::date as bucket_start
    from generate_series(5, 0, -1) as offset
  ), best_by_day as (
    select attempt_day, score, reps
    from (
      select created_at::date as attempt_day, score, reps,
        row_number() over (partition by created_at::date order by score desc, reps desc, created_at asc) as score_rank
      from solo_player_attempts
      where lower(player_email) = v_email
        and not is_flagged
    ) ranked
    where score_rank = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', to_char(months.bucket_start, 'Mon'),
    'score', coalesce(stats.score, 0),
    'max_reps', coalesce(stats.max_reps, 0),
    'active_days', coalesce(stats.active_days, 0)
  ) order by months.bucket_start), '[]'::jsonb)
  into v_monthly
  from months
  left join lateral (
    select max(score)::int as score, max(reps)::int as max_reps, count(*)::int as active_days
    from best_by_day
    where attempt_day >= months.bucket_start
      and attempt_day < months.bucket_start + interval '1 month'
  ) stats on true;

  with player_rollup as (
    select
      lower(player_email) as player_email,
      (array_agg(player_name order by created_at desc))[1] as player_name,
      count(distinct created_at::date)::int as consistency_days,
      max(reps)::int as max_reps,
      max(score)::int as best_daily_score
    from solo_player_attempts
    where not is_flagged
    group by lower(player_email)
  ), ranked as (
    select *, dense_rank() over (order by consistency_days desc, best_daily_score desc, player_name asc) as rank
    from player_rollup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'player_name', player_name,
    'player_email', player_email,
    'consistency_days', consistency_days,
    'max_reps', max_reps,
    'best_daily_score', best_daily_score
  ) order by rank, player_name), '[]'::jsonb)
  into v_consistency
  from ranked
  where rank <= 8;

  with player_rollup as (
    select
      lower(player_email) as player_email,
      (array_agg(player_name order by created_at desc))[1] as player_name,
      count(distinct created_at::date)::int as consistency_days,
      max(reps)::int as max_reps,
      max(score)::int as best_daily_score
    from solo_player_attempts
    where not is_flagged
    group by lower(player_email)
  ), ranked as (
    select *, dense_rank() over (order by max_reps desc, best_daily_score desc, player_name asc) as rank
    from player_rollup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'player_name', player_name,
    'player_email', player_email,
    'consistency_days', consistency_days,
    'max_reps', max_reps,
    'best_daily_score', best_daily_score
  ) order by rank, player_name), '[]'::jsonb)
  into v_max_reps
  from ranked
  where rank <= 8;

  with player_rollup as (
    select
      lower(player_email) as player_email,
      (array_agg(player_name order by created_at desc))[1] as player_name,
      count(distinct created_at::date)::int as consistency_days,
      max(reps)::int as max_reps,
      max(score)::int as best_daily_score
    from solo_player_attempts
    where created_at::date = current_date
      and not is_flagged
    group by lower(player_email)
  ), ranked as (
    select *, dense_rank() over (order by best_daily_score desc, max_reps desc, player_name asc) as rank
    from player_rollup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'player_name', player_name,
    'player_email', player_email,
    'consistency_days', consistency_days,
    'max_reps', max_reps,
    'best_daily_score', best_daily_score
  ) order by rank, player_name), '[]'::jsonb)
  into v_daily_high_scores
  from ranked
  where rank <= 8;

  with player_rollup as (
    select
      lower(player_email) as player_email,
      (array_agg(player_name order by created_at desc))[1] as player_name,
      count(distinct created_at::date)::int as consistency_days,
      max(reps)::int as max_reps,
      max(score)::int as best_daily_score
    from solo_player_attempts
    where created_at >= date_trunc('week', current_date)
      and created_at < date_trunc('week', current_date) + interval '1 week'
      and not is_flagged
    group by lower(player_email)
  ), ranked as (
    select *, dense_rank() over (order by best_daily_score desc, max_reps desc, player_name asc) as rank
    from player_rollup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'player_name', player_name,
    'player_email', player_email,
    'consistency_days', consistency_days,
    'max_reps', max_reps,
    'best_daily_score', best_daily_score
  ) order by rank, player_name), '[]'::jsonb)
  into v_weekly_high_scores
  from ranked
  where rank <= 8;

  with player_rollup as (
    select
      lower(player_email) as player_email,
      (array_agg(player_name order by created_at desc))[1] as player_name,
      count(distinct created_at::date)::int as consistency_days,
      max(reps)::int as max_reps,
      max(score)::int as best_daily_score
    from solo_player_attempts
    where created_at >= date_trunc('month', current_date)
      and created_at < date_trunc('month', current_date) + interval '1 month'
      and not is_flagged
    group by lower(player_email)
  ), ranked as (
    select *, dense_rank() over (order by best_daily_score desc, max_reps desc, player_name asc) as rank
    from player_rollup
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank', rank,
    'player_name', player_name,
    'player_email', player_email,
    'consistency_days', consistency_days,
    'max_reps', max_reps,
    'best_daily_score', best_daily_score
  ) order by rank, player_name), '[]'::jsonb)
  into v_monthly_high_scores
  from ranked
  where rank <= 8;

  select coalesce(jsonb_agg(badge), '[]'::jsonb)
  into v_badges
  from (
    select jsonb_build_object(
      'code', 'level_' || v_level,
      'title', 'Level ' || v_level,
      'description', 'Solo performance level',
      'tone', 'level'
    ) as badge
    union all
    select jsonb_build_object(
      'code', 'streak_7',
      'title', '7-day streak',
      'description', 'Completed solo workouts seven days in a row',
      'tone', 'streak'
    )
    where v_current_streak >= 7
    union all
    select jsonb_build_object(
      'code', 'daily_champion',
      'title', 'Best player of the day',
      'description', 'Top solo score today',
      'tone', 'gold'
    )
    where v_today_best_score > 0 and not exists (
      select 1
      from (
        select lower(player_email) as player_email, max(score) as best_score
        from solo_player_attempts
        where created_at::date = current_date
          and not is_flagged
        group by lower(player_email)
      ) today_scores
      where today_scores.best_score > v_today_best_score
    )
    union all
    select jsonb_build_object(
      'code', 'weekly_champion',
      'title', 'Best player of the week',
      'description', 'Top solo score this week',
      'tone', 'gold'
    )
    where exists (select 1 from solo_player_attempts where lower(player_email) = v_email and created_at >= date_trunc('week', current_date) and not is_flagged)
      and not exists (
        select 1
        from (
          select lower(player_email) as player_email, max(score) as best_score
          from solo_player_attempts
          where created_at >= date_trunc('week', current_date)
            and not is_flagged
          group by lower(player_email)
        ) week_scores
        where week_scores.best_score > (
          select max(score) from solo_player_attempts where lower(player_email) = v_email and created_at >= date_trunc('week', current_date) and not is_flagged
        )
      )
    union all
    select jsonb_build_object(
      'code', 'star_' || exercise,
      'title', 'Star ' || initcap(replace(exercise, '-', ' ')),
      'description', 'Top reps for this workout',
      'tone', 'star'
    )
    from (
      select distinct exercise
      from solo_player_attempts mine
      where lower(mine.player_email) = v_email
        and mine.reps > 0
        and not mine.is_flagged
        and mine.reps >= (select max(all_attempts.reps) from solo_player_attempts all_attempts where all_attempts.exercise = mine.exercise and not all_attempts.is_flagged)
    ) exercise_stars
  ) badges;

  return jsonb_build_object(
    'player_name', coalesce(v_player_name, ''),
    'player_email', v_email,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'level', coalesce(v_level, 1),
    'badges', v_badges,
    'today_best_score', v_today_best_score,
    'today_max_reps', v_today_max_reps,
    'total_attempts', v_total_attempts,
    'daily', v_daily,
    'weekly', v_weekly,
    'monthly', v_monthly,
    'consistency_leaders', v_consistency,
    'max_rep_leaders', v_max_reps,
    'daily_high_score_leaders', v_daily_high_scores,
    'weekly_high_score_leaders', v_weekly_high_scores,
    'monthly_high_score_leaders', v_monthly_high_scores
  );
end;
$$;

drop function if exists public.refresh_solo_monthly_winner(date);

create or replace function public.refresh_solo_monthly_winner(p_month_start date default date_trunc('month', current_date)::date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month_start, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_month_start, current_date)) + interval '1 month')::date;
  v_existing solo_monthly_winners%rowtype;
  v_winner record;
begin
  if auth.uid() is null or not is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  select * into v_existing
  from solo_monthly_winners
  where month_start = v_month_start;

  if v_existing.status = 'awarded' then
    return jsonb_build_object(
      'month_start', v_existing.month_start,
      'player_email', v_existing.player_email,
      'player_name', v_existing.player_name,
      'score', v_existing.score,
      'reps', v_existing.reps,
      'exercise', v_existing.exercise,
      'status', v_existing.status,
      'voucher_code', v_existing.voucher_code,
      'awarded_at', v_existing.awarded_at
    );
  end if;

  select id, player_email, player_name, score, reps, exercise
  into v_winner
  from solo_player_attempts
  where created_at >= v_month_start
    and created_at < v_month_end
    and not is_flagged
  order by score desc, reps desc, created_at asc
  limit 1;

  if v_winner.id is null then
    delete from solo_monthly_winners
    where month_start = v_month_start
      and status in ('pending', 'notified', 'void');
    return null;
  end if;

  insert into solo_monthly_winners (
    month_start,
    player_email,
    player_name,
    score,
    reps,
    exercise,
    winning_attempt_id,
    status
  )
  values (
    v_month_start,
    lower(v_winner.player_email),
    v_winner.player_name,
    v_winner.score,
    v_winner.reps,
    v_winner.exercise,
    v_winner.id,
    'pending'
  )
  on conflict (month_start) do update
  set player_email = excluded.player_email,
      player_name = excluded.player_name,
      score = excluded.score,
      reps = excluded.reps,
      exercise = excluded.exercise,
      winning_attempt_id = excluded.winning_attempt_id,
      status = case
        when solo_monthly_winners.status = 'void' then 'pending'
        else solo_monthly_winners.status
      end,
      voucher_code = case
        when solo_monthly_winners.status = 'void' then null
        else solo_monthly_winners.voucher_code
      end,
      awarded_at = case
        when solo_monthly_winners.status = 'void' then null
        else solo_monthly_winners.awarded_at
      end,
      updated_at = now()
  returning * into v_existing;

  return jsonb_build_object(
    'month_start', v_existing.month_start,
    'player_email', v_existing.player_email,
    'player_name', v_existing.player_name,
    'score', v_existing.score,
    'reps', v_existing.reps,
    'exercise', v_existing.exercise,
    'status', v_existing.status,
    'voucher_code', v_existing.voucher_code,
    'awarded_at', v_existing.awarded_at
  );
end;
$$;

drop function if exists public.get_solo_monthly_winner(date);

create or replace function public.get_solo_monthly_winner(p_month_start date default date_trunc('month', current_date)::date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month_start, current_date))::date;
  v_winner solo_monthly_winners%rowtype;
begin
  select * into v_winner
  from solo_monthly_winners
  where month_start = v_month_start;

  if v_winner.month_start is null then
    return null;
  end if;

  return jsonb_build_object(
    'month_start', v_winner.month_start,
    'player_email', v_winner.player_email,
    'player_name', v_winner.player_name,
    'score', v_winner.score,
    'reps', v_winner.reps,
    'exercise', v_winner.exercise,
    'status', v_winner.status,
    'voucher_code', case when auth.uid() is not null and is_platform_admin() then v_winner.voucher_code else null end,
    'awarded_at', case when auth.uid() is not null and is_platform_admin() then v_winner.awarded_at else null end
  );
end;
$$;

drop function if exists public.get_platform_usage_dashboard();

create or replace function public.get_platform_usage_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
  v_recent_flagged jsonb;
  v_monthly_winner jsonb;
begin
  if auth.uid() is null or not is_platform_admin() then
    raise exception 'Unauthorized';
  end if;

  select jsonb_build_object(
    'solo_attempts_total', (select count(*)::int from solo_player_attempts),
    'solo_attempts_today', (select count(*)::int from solo_player_attempts where created_at::date = current_date),
    'solo_attempts_this_week', (select count(*)::int from solo_player_attempts where created_at >= date_trunc('week', current_date)),
    'solo_attempts_this_month', (select count(*)::int from solo_player_attempts where created_at >= date_trunc('month', current_date)),
    'solo_players_total', (select count(distinct lower(player_email))::int from solo_player_attempts),
    'solo_flagged_total', (select count(*)::int from solo_player_attempts where is_flagged),
    'solo_flagged_unreviewed', (select count(*)::int from solo_player_attempts where is_flagged and reviewed_at is null),
    'active_guest_challenges', (select count(*)::int from guest_challenges where deleted_at is null and end_date >= now()),
    'active_organization_trials', (select count(*)::int from organization_trials where expires_at >= now())
  )
  into v_summary;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'player_name', player_name,
    'player_email', player_email,
    'exercise', exercise,
    'reps', reps,
    'score', score,
    'flag_reasons', flag_reasons,
    'reviewed_at', reviewed_at,
    'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  into v_recent_flagged
  from (
    select *
    from solo_player_attempts
    where is_flagged
    order by created_at desc
    limit 12
  ) flagged;

  select jsonb_build_object(
    'month_start', month_start,
    'player_email', player_email,
    'player_name', player_name,
    'score', score,
    'reps', reps,
    'exercise', exercise,
    'status', status,
    'voucher_code', voucher_code,
    'awarded_at', awarded_at
  )
  into v_monthly_winner
  from solo_monthly_winners
  where month_start = date_trunc('month', current_date)::date;

  return jsonb_build_object(
    'summary', v_summary,
    'recent_flagged_attempts', v_recent_flagged,
    'monthly_winner', v_monthly_winner
  );
end;
$$;

alter table solo_monthly_winners enable row level security;

notify pgrst, 'reload schema';
