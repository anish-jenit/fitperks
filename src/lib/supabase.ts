import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function isPlaceholder(value: string | undefined): boolean {
  if (!value) {
    return true
  }

  return (
    value.includes('YOUR_PROJECT_REF') ||
    value.includes('YOUR_SUPABASE_ANON_KEY') ||
    value.includes('example.supabase.co') ||
    value === 'demo-key'
  )
}

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey) && !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey)
export const useFlowStubs = (import.meta.env.VITE_USE_FLOW_STUBS as string | undefined) === 'true' || !hasSupabaseConfig

export const supabase = createClient(supabaseUrl ?? 'https://example.supabase.co', supabaseAnonKey ?? 'demo-key', {
  auth: {
    persistSession: true,
  },
})

export async function ensureAnonymousParticipantSession(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    return
  }

  const { error } = await supabase.auth.signInAnonymously()
  if (error) {
    throw error
  }
}

export async function adminSignIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw error
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
