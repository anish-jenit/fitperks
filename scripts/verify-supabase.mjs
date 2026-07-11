import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey) {
  console.error('Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or .env.')
  process.exit(1)
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
})

const supabaseAdmin = serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    })
  : null

const tableChecks = [
  'organizations',
  'organization_settings',
  'participants',
  'teams',
  'challenges',
  'workouts',
  'participant_streaks',
  'team_streaks',
  'streak_bonus_rules',
  'point_transactions',
  'audit_logs',
]

try {
  for (const table of tableChecks) {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) {
      throw new Error(`Table check failed for ${table}: ${error.message}`)
    }
  }

  const { data, error } = await supabase.from('organizations').select('*').limit(1)

  if (error) {
    throw new Error(`organizations fetch failed: ${error.message}`)
  }

  if (data && data.length > 0) {
    console.log('Supabase connection verified. Multi-organization FitPerks tables are accessible.')
    process.exit(0)
  }

  // Anonymous reads can be empty under RLS even when seed data exists.
  if (supabaseAdmin) {
    const { data: adminOrgs, error: adminError } = await supabaseAdmin.from('organizations').select('id').limit(1)

    if (adminError) {
      throw new Error(`service role organizations check failed: ${adminError.message}`)
    }

    if (adminOrgs && adminOrgs.length > 0) {
      console.log('Supabase connection verified. Seed data exists (confirmed using service role).')
      process.exit(0)
    }
  }

  const orgCodesToProbe = [process.env.VITE_DEFAULT_ORG_CODE, 'COMPANYA2026', 'SCHOOLB2026'].filter(Boolean)

  for (const orgCode of orgCodesToProbe) {
    const { data: challenge, error: rpcError } = await supabase.rpc('get_active_challenge_by_code', {
      p_organization_code: orgCode,
    })

    if (rpcError) {
      continue
    }

    if (challenge) {
      console.log('Supabase connection verified. Seeded challenge data is accessible via RPC under RLS.')
      process.exit(0)
    }
  }

  console.warn(
    'Connected successfully, but no seed data was detected. Run supabase/seed.sql, then retry. If you already seeded, set SUPABASE_SERVICE_ROLE_KEY for an RLS-bypassed verification check.'
  )
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Supabase verification failed.')
  process.exit(1)
}
