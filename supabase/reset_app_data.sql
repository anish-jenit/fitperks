-- Deletes FitPerks application data so the setup and challenge flows can be
-- tested again from scratch. Authentication users are intentionally preserved.
begin;

truncate table
  audit_logs,
  point_transactions,
  streak_bonus_awards,
  streak_bonus_rules,
  team_streaks,
  participant_streaks,
  workouts,
  challenge_participants,
  challenges,
  participant_profiles,
  participants,
  teams,
  admin_users,
  organization_invites,
  organization_settings,
  organizations,
  guest_challenge_attempts,
  guest_challenge_players,
  guest_challenges
restart identity cascade;

commit;
