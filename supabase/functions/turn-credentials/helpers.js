// Pure helpers for coturn's time-limited REST API credential scheme:
// username = expiry unix timestamp, credential = base64(HMAC-SHA1(secret, username)).
// coturn verifies the same way when `use-auth-secret` is configured.

export const hmacSha1Base64 = async (secret, message) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  let binary = ''
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const buildTurnCredential = async ({ secret, ttlSeconds, now = Date.now() }) => {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds
  const username = String(expiresAt)
  const credential = await hmacSha1Base64(secret, username)
  return { username, credential, expiresAt }
}

// A falsy tlsPort leaves out the turns: URL, for relays (or free plans) without TLS.
export const buildIceServers = ({ host, port, tlsPort, username, credential }) => ([
  { urls: [`stun:${host}:${port}`] },
  {
    urls: [
      `turn:${host}:${port}?transport=udp`,
      `turn:${host}:${port}?transport=tcp`,
      ...(tlsPort ? [`turns:${host}:${tlsPort}?transport=tcp`] : [])
    ],
    username,
    credential
  }
])

// Picks the credential scheme from what is configured: a shared secret mints
// short-lived credentials (coturn REST scheme); otherwise a fixed username and
// password from a provider dashboard (e.g. ExpressTURN's free plan) are passed
// through as is. Returns null when neither is set.
export const resolveTurnCredential = async ({ sharedSecret, username, password, ttlSeconds, now = Date.now() }) => {
  if (sharedSecret) return buildTurnCredential({ secret: sharedSecret, ttlSeconds, now })
  if (username && password) return { username, credential: password }
  return null
}
