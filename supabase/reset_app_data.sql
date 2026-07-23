-- Deletes FitPerks application data so the setup and challenge flows can be
-- tested again from scratch. Authentication users and admin role assignments
-- are intentionally preserved.
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
  organization_invites,
  organization_settings,
  organizations,
  organization_trial_attempts,
  organization_trial_players,
  organization_trials,
  solo_player_attempts,
  guest_challenge_attempts,
  guest_challenge_players,
  guest_challenges
restart identity cascade;

commit;
