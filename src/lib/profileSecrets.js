const MISSING_RPC_CODES = new Set(['42883', 'PGRST202'])

export const isMissingProfileSecretsRpc = error => {
  if (!error) return false
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return MISSING_RPC_CODES.has(error.code)
    || (
      (message.includes('schema cache') || message.includes('does not exist'))
      && (
        message.includes('get_my_profile_secrets')
        || message.includes('save_my_profile_key_backup')
      )
    )
}

const firstRow = data => Array.isArray(data) ? (data[0] || null) : (data || null)

export const loadMyProfileSecrets = async (client, profileId) => {
  const rpcResult = await client.rpc('get_my_profile_secrets')
  if (!rpcResult.error) {
    return { data: firstRow(rpcResult.data), error: null, legacyFallback: false }
  }
  if (!isMissingProfileSecretsRpc(rpcResult.error)) {
    return { data: null, error: rpcResult.error, legacyFallback: false }
  }

  const legacyResult = await client
    .from('profiles')
    .select('encrypted_private_key, public_key')
    .eq('id', profileId)
    .maybeSingle()

  return { ...legacyResult, legacyFallback: true }
}

export const saveMyProfileKeyBackup = async (
  client,
  { profileId, encryptedPrivateKey, publicKey = null }
) => {
  const rpcResult = await client.rpc('save_my_profile_key_backup', {
    new_encrypted_private_key: encryptedPrivateKey,
    new_public_key: publicKey
  })
  if (!rpcResult.error) return { ...rpcResult, legacyFallback: false }
  if (!isMissingProfileSecretsRpc(rpcResult.error)) {
    return { ...rpcResult, legacyFallback: false }
  }

  const updatePayload = { encrypted_private_key: encryptedPrivateKey }
  if (publicKey) updatePayload.public_key = publicKey
  const legacyResult = await client.from('profiles').update(updatePayload).eq('id', profileId)
  return { ...legacyResult, legacyFallback: true }
}
