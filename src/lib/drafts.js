/**
 * Unsent composer text per conversation, written through to storage so it
 * survives a reload. DM drafts are plaintext on this device only — the same
 * place the decrypted message cache already lives — and sign-out clears
 * localStorage, so they never outlive the session that typed them.
 */
export const createDraftStore = (storage, key) => {
  let drafts = {}
  try {
    const parsed = JSON.parse(storage?.getItem(key) || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) drafts = parsed
  } catch {
    drafts = {}
  }

  const persist = () => {
    try {
      if (Object.keys(drafts).length) storage?.setItem(key, JSON.stringify(drafts))
      else storage?.removeItem(key)
    } catch {
      // Quota or private mode: keep the in-memory copy and carry on.
    }
  }

  return {
    get: chatKey => (typeof drafts[chatKey] === 'string' ? drafts[chatKey] : ''),
    set: (chatKey, text) => {
      if (text) drafts[chatKey] = text
      else delete drafts[chatKey]
      persist()
    }
  }
}
