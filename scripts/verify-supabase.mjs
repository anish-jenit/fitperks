import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or .env.')
  process.exit(1)
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
})

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

  if (!data || data.length === 0) {
    console.warn('Connected successfully, but no organizations found. Run supabase/seed.sql.')
  } else {
    console.log('Supabase connection verified. Multi-organization FitPerks tables are accessible.')
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Supabase verification failed.')
  process.exit(1)
}
