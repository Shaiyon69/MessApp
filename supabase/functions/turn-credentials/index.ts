// Mints short-lived TURN credentials for authenticated clients so 1:1 calls
// and group voice channels can traverse NATs/firewalls that plain STUN can't.
// Requires a valid Supabase JWT (default platform verify_jwt behavior) so
// only signed-in users can obtain relay credentials.
//
// Credentials are computed locally using coturn's time-limited REST API
// scheme (see helpers.js), so no third-party credential API is called.
//
// TURN_HOST plus either TURN_SHARED_SECRET (short-lived credentials) or
// TURN_USERNAME + TURN_PASSWORD (fixed credentials from a provider dashboard,
// such as ExpressTURN's free plan) are REQUIRED. Fixed credentials are visible to
// every signed-in client; rotate them in the provider dashboard if they leak.
// Set TURN_TLS_PORT=off when the relay has no TLS port. There is deliberately no
// built-in default relay. The Open Relay Project endpoints this previously
// defaulted to (openrelay.metered.ca / staticauth.openrelay.metered.ca) were
// verified unreachable: they answer neither a STUN binding request nor a TURN
// Allocate, so they would hand clients credentials for a dead host and leave
// calls stuck in "connecting". Point these at a relay you control or a
// provider account — see infra/coturn/README.md.
import { buildIceServers, resolveTurnCredential } from './helpers.js'

// Browsers preflight this function with OPTIONS because supabase-js sends an
// Authorization header. Without these headers (and a 2xx OPTIONS reply) the
// preflight fails and the browser never issues the real request at all.
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' }
})

const logEvent = (label: string, metadata: Record<string, unknown>) => console.log(`[${label}]`, metadata)

const envOrDefault = (name: string, fallback: string) => Deno.env.get(name)?.trim() || fallback

// Long enough to cover call setup plus a full call session; short enough to
// bound the blast radius if a credential leaks.
const TTL_SECONDS = 3600

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const turnHost = Deno.env.get('TURN_HOST')?.trim()
  const notConfigured = () => {
    // Fail loudly rather than issuing credentials for a relay that isn't set
    // up; the client degrades to STUN-only and logs why.
    logEvent('TURN_CREDENTIALS', { status: 'not_configured' })
    return jsonResponse({ error: 'TURN relay is not configured (set TURN_HOST and TURN_SHARED_SECRET, or TURN_USERNAME and TURN_PASSWORD)' }, 503)
  }
  if (!turnHost) return notConfigured()

  try {
    const turnPort = envOrDefault('TURN_PORT', '3478')
    const tlsSetting = envOrDefault('TURN_TLS_PORT', '5349')
    const turnTlsPort = tlsSetting.toLowerCase() === 'off' ? null : tlsSetting

    const resolved = await resolveTurnCredential({
      sharedSecret: Deno.env.get('TURN_SHARED_SECRET')?.trim(),
      username: Deno.env.get('TURN_USERNAME')?.trim(),
      password: Deno.env.get('TURN_PASSWORD')?.trim(),
      ttlSeconds: TTL_SECONDS
    })
    if (!resolved) return notConfigured()
    const { username, credential } = resolved
    const iceServers = buildIceServers({ host: turnHost, port: turnPort, tlsPort: turnTlsPort, username, credential })

    logEvent('TURN_CREDENTIALS', { status: 'issued', host: turnHost, ttlSeconds: TTL_SECONDS })
    return jsonResponse({ iceServers, ttlSeconds: TTL_SECONDS })
  } catch (_error) {
    logEvent('TURN_CREDENTIALS', { status: 'credential_error' })
    return jsonResponse({ error: 'TURN credential generation failed' }, 500)
  }
})
