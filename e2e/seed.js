/**
 * Global setup for the Playwright suite: provisions two confirmed users and an
 * accepted friendship on the LOCAL Supabase stack, then leaves everything else
 * (keys, DM rooms, servers) to the app so the specs exercise the real flows.
 *
 * Requires `npx supabase start` and a `.env.e2e` holding the local stack URL,
 * anon key, and service_role key.
 */
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.e2e')) process.loadEnvFile('.env.e2e')

export const USER_A = {
  email: 'e2e-alice@messapp.test',
  password: 'e2e-alice-password-1',
  username: 'e2ealice',
}

export const USER_B = {
  email: 'e2e-bob@messapp.test',
  password: 'e2e-bob-password-1',
  username: 'e2ebob',
}

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in .env.e2e (see .env.e2e.example)')
  }
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Refusing to seed a non-local Supabase: ${url}`)
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Creates the user if missing; returns its id either way. */
async function ensureUser(admin, user) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const existing = data.users.find(candidate => candidate.email === user.email)
  if (existing) return existing.id

  const created = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { username: user.username },
  })
  if (created.error) throw created.error
  return created.data.user.id
}

/** create_or_get_dm rejects non-friends, so the friendship has to exist first. */
async function ensureFriendship(admin, senderId, receiverId) {
  const { data, error } = await admin
    .from('friendships')
    .select('id, status')
    .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
    .maybeSingle()
  if (error) throw error

  if (!data) {
    const insert = await admin.from('friendships').insert({ sender_id: senderId, receiver_id: receiverId, status: 'accepted' })
    if (insert.error) throw insert.error
    return
  }
  if (data.status !== 'accepted') {
    const update = await admin.from('friendships').update({ status: 'accepted' }).eq('id', data.id)
    if (update.error) throw update.error
  }
}

export default async function globalSetup() {
  const admin = adminClient()
  const [idA, idB] = [await ensureUser(admin, USER_A), await ensureUser(admin, USER_B)]

  // The handle_new_user trigger creates the profile row; make sure the username
  // is what the specs search for even when the row predates this seed.
  for (const [id, user] of [[idA, USER_A], [idB, USER_B]]) {
    const { error } = await admin.from('profiles').upsert({ id, username: user.username }, { onConflict: 'id' })
    if (error) throw error
  }

  await ensureFriendship(admin, idA, idB)
}
