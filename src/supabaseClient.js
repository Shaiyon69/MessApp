/**
 * Creates the single browser Supabase client used by auth, database, Storage,
 * and Realtime consumers. Only public client configuration belongs here;
 * authorization remains enforced by server-side RLS and RPC policies.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY
const missingSupabaseEnv = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY'
].filter(Boolean)

export const supabaseConfigError = missingSupabaseEnv.length
  ? `Missing Supabase environment variable${missingSupabaseEnv.length > 1 ? 's' : ''}: ${missingSupabaseEnv.join(', ')}`
  : null

export const supabase = supabaseConfigError ? null : createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'messapp-auth'
  },
  realtime: {
    params: {
      eventsPerSecond: 25,
    }
  }
})
