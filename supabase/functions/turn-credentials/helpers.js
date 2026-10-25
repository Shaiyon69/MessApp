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

export const buildIceServers = ({ host, port, tlsPort, username, credential }) => ([
  { urls: [`stun:${host}:${port}`] },
  {
    urls: [
      `turn:${host}:${port}?transport=udp`,
      `turn:${host}:${port}?transport=tcp`,
      `turns:${host}:${tlsPort}?transport=tcp`
    ],
    username,
    credential
  }
])
