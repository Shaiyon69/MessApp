// Lets a signed-in Messapp desktop user hand Purrch a sign-in token.
// The token signs Purrch in as the caller only: the user id comes from the
// verified JWT, never from the request body. It is one-time, expires with the
// project's OTP expiry, and no email is sent (generateLink only returns it).
// Platform verify_jwt is not enough: the anon key is a valid JWT, so the token
// is checked against Auth for a real user (signedInUserId below).
import { createClient } from 'npm:@supabase/supabase-js@2.108.2'

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' }
})

// The anon key resolves to no user, so only a real session passes.
const signedInUserId = async (authorization: string | null) => {
  if (!authorization?.startsWith('Bearer ')) return null
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' }
  })
  if (!response.ok) return null
  const user = await response.json().catch(() => null)
  return typeof user?.id === 'string' ? user.id : null
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const userId = await signedInUserId(request.headers.get('authorization')).catch(() => null)
  if (!userId) return jsonResponse({ error: 'Sign in first' }, 401)

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    const { data: found, error: userError } = await admin.auth.admin.getUserById(userId)
    if (userError || !found.user?.email) throw userError ?? new Error('user has no email')
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email })
    if (error || !data.properties?.hashed_token) throw error ?? new Error('no hashed_token')
    return jsonResponse({ token_hash: data.properties.hashed_token })
  } catch (error) {
    console.error('[PURRCH_LINK]', error instanceof Error ? error.message : 'link_error')
    return jsonResponse({ error: 'Could not create a link' }, 500)
  }
})
