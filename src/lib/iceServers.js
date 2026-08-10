/**
 * Resolves WebRTC ICE servers shared by 1:1 calls and mesh voice channels.
 *
 * STUN alone only connects peers whose NATs allow direct hole-punching. Calls
 * between restrictive networks (symmetric NAT, corporate/campus firewalls,
 * some CGNAT mobile carriers) additionally need a TURN relay. TURN credentials
 * come from the `turn-credentials` edge function; if that function is not
 * deployed or not configured with a working relay, this degrades to STUN-only
 * and such calls will fail to connect. `hasTurnRelay()` reports which mode is
 * active so the UI can explain a failure instead of silently hanging.
 */
import { supabase } from '../supabaseClient'

// Multiple STUN hosts so candidate gathering survives one provider being down.
export const STUN_ONLY_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' }
]

const CACHE_SAFETY_MARGIN_MS = 5 * 60 * 1000
const DEFAULT_TTL_SECONDS = 3600

let cachedIceServers = null
let cachedExpiresAt = 0
let inflightRequest = null
let turnRelayAvailable = false

const hasTurnUrl = iceServers => iceServers.some(server => {
  const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls]
  return urls.some(url => typeof url === 'string' && /^turns?:/i.test(url))
})

const fetchIceServers = async () => {
  const { data, error } = await supabase.functions.invoke('turn-credentials')
  if (error || !Array.isArray(data?.iceServers) || data.iceServers.length === 0) {
    throw error || new Error('Empty ICE server response')
  }
  return { iceServers: data.iceServers, ttlSeconds: Number(data.ttlSeconds) || DEFAULT_TTL_SECONDS }
}

/** True when the last resolved ICE config included a TURN relay. */
export const hasTurnRelay = () => turnRelayAvailable

/** Returns cached ICE servers, refreshing near expiry; resolves to STUN-only if TURN issuance fails. */
export async function getIceServers() {
  const now = Date.now()
  if (cachedIceServers && cachedExpiresAt > now) return cachedIceServers

  if (!inflightRequest) {
    inflightRequest = fetchIceServers()
      .then(({ iceServers, ttlSeconds }) => {
        // STUN entries are kept alongside issued TURN so a relay outage still
        // leaves direct connections working.
        const merged = [...STUN_ONLY_ICE_SERVERS, ...iceServers]
        turnRelayAvailable = hasTurnUrl(iceServers)
        if (!turnRelayAvailable) {
          console.warn('[ICE_SERVERS] turn-credentials returned no TURN relay; calls across restrictive networks will fail.')
        }
        cachedIceServers = merged
        cachedExpiresAt = Date.now() + Math.max(ttlSeconds * 1000 - CACHE_SAFETY_MARGIN_MS, 30_000)
        return cachedIceServers
      })
      .catch((error) => {
        turnRelayAvailable = false
        console.warn(
          '[ICE_SERVERS] No TURN relay available (turn-credentials unreachable or unconfigured). '
          + 'Falling back to STUN-only: calls only connect when both peers can reach each other directly.',
          error?.message || error
        )
        // Cache the fallback briefly so every call attempt doesn't re-invoke a
        // function that is known to be failing.
        cachedIceServers = STUN_ONLY_ICE_SERVERS
        cachedExpiresAt = Date.now() + 60_000
        return cachedIceServers
      })
      .finally(() => {
        inflightRequest = null
      })
  }
  return inflightRequest
}
