const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export async function generateEcdhKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  )
}

export async function exportPublicKey(key) {
  return await crypto.subtle.exportKey('jwk', key)
}

export async function importPublicKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
}

export async function deriveSharedAesKey(ownPrivateKey, peerPublicKeyJwk) {
  const importedPeerKey = await importPublicKey(peerPublicKeyJwk)
  return await crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: importedPeerKey
    },
    ownPrivateKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  )
}

export function toBase64(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin)
}

export function fromBase64(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export async function encryptWithAesGcm(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(data)
  )

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted)
  }
}

export async function decryptWithAesGcm(key, { iv, ciphertext }) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(new Uint8Array(fromBase64(iv)))
    },
    key,
    fromBase64(ciphertext)
  )
  return textDecoder.decode(decrypted)
}

export async function encryptBinaryAesGcm(key, arrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  )
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted)
  }
}

export async function decryptBinaryAesGcm(key, encryptedObj) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(fromBase64(encryptedObj.iv))
    },
    key,
    fromBase64(encryptedObj.ciphertext)
  )
  return decrypted
}

export function bufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function base64ToBuffer(base64) {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function fingerprintKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key)
  const hash = await crypto.subtle.digest('SHA-256', raw)
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 12).match(/.{1,4}/g).join(':')
}

export function generateSecureRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const maxSafe = 256 - (256 % chars.length)

  while (result.length < length) {
    const array = new Uint8Array(1)
    crypto.getRandomValues(array)
    if (array[0] < maxSafe) {
      result += chars[array[0] % chars.length]
    }
  }
  return result
}

export function generateSecureRandomNumber(min, max) {
  const range = max - min + 1
  const maxVal = 4294967296
  const maxSafeValue = maxVal - (maxVal % range)
  const array = new Uint32Array(1)

  do {
    crypto.getRandomValues(array)
  } while (array[0] >= maxSafeValue)

  return min + (array[0] % range)
}
